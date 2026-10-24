'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const runtime=path.resolve(process.argv[2]||path.join(__dirname,'runtime'));let tests=0;
function check(label,fn){fn();tests++;console.log('PASS',label);}
function source(file,name,next){const s=fs.readFileSync(path.join(runtime,file),'utf8');const from=s.indexOf('function '+name+'('),to=s.indexOf(next,from);assert(from>=0&&to>from);return s.slice(from,to).trim();}
const startFn=source('game_start_ui_v0_83_title_bgm.js','resumeSavedFlow','start.querySelectorAll');
for(const phase of ['COMMAND','POLITICAL'])check('continue '+phase+' routes through pending maintenance',()=>{
 let monthly=0,battles=0;const state={current_faction:'BRITISH',runtime_flow_phase:phase,calendar:{year:1775,month:7}};
 const window={__phase2UI:{getState:()=>state},__cityCommandUI:{setFaction(){},syncCalendar(){}},__eventNotificationUI:{resumeCommandFlow(){monthly++;}},__battleUI:{resumePendingBattle(){battles++;}},__politicalPhaseUI:{open(done){if(done)done();}}};
 const ctx={window,start:{hidden:true},document:{querySelectorAll:()=>[]},savedFlowPhase:s=>s.runtime_flow_phase};vm.createContext(ctx);vm.runInContext(startFn+';resumeSavedFlow();',ctx);assert.equal(monthly,1);assert.equal(battles,0);
});
const loadFn=source('official_completion_v0_88_hq_collapse.js','applySave','async function manualSave');
for(const phase of ['COMMAND','POLITICAL'])check('manual load '+phase+' routes through pending maintenance',()=>{
 let monthly=0,battles=0,cancelled=0,state;const node={hidden:false};
 const window={__cityCommandUI:{},__eventNotificationUI:{cancel(){},resumeCommandFlow(){monthly++;}},__battleUI:{abortFailedAttack(){},resumePendingBattle(){battles++;}},__politicalPhaseUI:{open(done){if(done)done();}}};
 const ctx={window,clone:x=>JSON.parse(JSON.stringify(x)),$:()=>node,stopSlideshow(){},conclusionVisible:false,applying:false,
 document:{documentElement:{classList:{remove(){}}},querySelectorAll:()=>[]},rawCitySetState(){},rawMilitarySetState(x){state=x;},cityUI:{setFaction(){},syncCalendar(){},refreshMilitaryStatus(){},cancelMonthlyBlockadeMaintenance(){cancelled++;}},ui:{getState:()=>state,render(){}},refreshContinueButton(){},setTimeout:fn=>fn()};
 vm.createContext(ctx);vm.runInContext(loadFn,ctx);ctx.applySave({military:{calendar:{year:1775,month:7},runtime_flow_phase:phase},city:{},metadata:{faction:'BRITISH'}},true);assert.equal(monthly,1);assert.equal(battles,0);assert.equal(cancelled,1);
});
const eventSource=fs.readFileSync(path.join(runtime,'event_notification_ui_v0_1.js'),'utf8');
check('maintenance gates battle until decision callback',()=>{
 const name='function resumeCommandFlow(',from=eventSource.indexOf(name),to=eventSource.indexOf('function runMonthOpeningSequence(',from);assert(from>=0&&to>from);
 let battles=0,decision;const ctx={window:{__cityCommandUI:{processMonthlyBlockadeMaintenance(cb){decision=cb;return true;}},__battleUI:{resumePendingBattle(){battles++;}}}};vm.createContext(ctx);vm.runInContext(eventSource.slice(from,to),ctx);ctx.resumeCommandFlow();assert.equal(battles,0);decision();assert.equal(battles,1);
});
console.log('SUMMARY',tests,'resume integration checks');
