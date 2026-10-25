'use strict';
// 1775-08 British-player screenshot: Patriot AI aborts with
// "control is not defined" while screening an empty-city ATTACK candidate.
// Exercise the exact production private `available()` function in isolation:
// this deliberately DOES NOT define a global `control` helper.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');

const file=path.resolve(__dirname,'../runtime/patriot_ai_official_browser_v2.js');
const published=process.argv.includes('--published-beta10');
const source=published
 ?execFileSync('git',['show','HEAD:runtime/patriot_ai_official_browser_v2.js'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'})
 :fs.readFileSync(file,'utf8');
const moduleStart=source.indexOf("modules['AI_OFFICIAL_CURRENT/patriot_strategic_ai_v10_official.js']");
assert.ok(moduleStart>=0,'missing actual Patriot V10 module');
const start=source.indexOf('function available(m,row){',moduleStart);
const end=source.indexOf('function availablePlan(',start);
assert.ok(start>moduleStart&&end>start,'missing production attack availability guard');

const box={
 P:{militaryControl:(m,id)=>m.territory?.[id]||'UNCONTROLLED'},
 political:{},
};
const available=vm.runInNewContext(source.slice(start,end)+'\navailable;',box,{filename:'patriot_strategic_ai_v10_official.js'});
const fake=(territory='BRITISH')=>({
 territory:{ENEMY_EMPTY:territory},
 field_armies:{P_1:{id:'P_1',faction:'PATRIOT',manpower:800}},
 garrisons:{},battles:{},action_log:[],
});
const candidate=(type='ATTACK')=>({action:{type,target:'ENEMY_EMPTY',ids:['P_1']}});
const cases=[];
function check(name,fn){fn();cases.push(name);}

check('Empty British-controlled destination is a valid attack target even with no field defender',()=>{
 assert.equal(available(fake(),candidate()),true);
});
check('Empty neutral destination is not misclassified as a British target',()=>{
 assert.equal(available(fake('UNCONTROLLED'),candidate()),false);
});
check('Empty Patriot-controlled destination is rejected',()=>{
 assert.equal(available(fake('PATRIOT'),candidate()),false);
});
check('A stationed British defender is still attackable',()=>{
 const m=fake('UNCONTROLLED');m.field_armies.B_1={id:'B_1',faction:'BRITISH',location_city_id:'ENEMY_EMPTY',manpower:750};
 assert.equal(available(m,candidate()),true);
});
check('A British garrison is still attackable',()=>{
 const m=fake('UNCONTROLLED');m.garrisons.ENEMY_EMPTY={faction:'BRITISH',manpower:100};
 assert.equal(available(m,candidate()),true);
});
check('A busy attacking army is still prohibited',()=>{
 const m=fake();m.field_armies.P_1.battle_id='BATTLE';m.battles.BATTLE={status:'active'};
 assert.equal(available(m,candidate()),false);
});
check('Normal non-attack orders do not need a control lookup',()=>{
 assert.equal(available(fake(),candidate('MOVE')),true);
});
check('No bundled AI module invokes a control helper missing from its own module',()=>{
 for(const fileName of ['patriot_ai_official_browser_v2.js','royalist_ai_official_browser_v3.js']){
  const bundled=fs.readFileSync(path.resolve(__dirname,'../runtime',fileName),'utf8');
  const blocks=bundled.split(/(?=\nmodules\[)/);
  for(const block of blocks){
   const moduleName=block.match(/modules\['([^']+)'\]/)?.[1];
   if(!moduleName||!/\bcontrol\(/.test(block))continue;
   assert.match(block,/\b(?:function\s+control\s*\(|(?:const|let|var)\s+control\s*=)/,fileName+': '+moduleName);
  }
 }
});

console.log('PATRIOT_ATTACK_AVAILABILITY_INCIDENT_REGRESSION',JSON.stringify({cases:cases.length,published,checks:cases}));
