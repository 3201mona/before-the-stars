/* Political phase information panels and read-only commander safety. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../runtime');
const model=require(path.join(root,'political_reference_model_v1.js'));
const sandbox={};
vm.runInNewContext(fs.readFileSync(path.join(root,'political_phase_data_v0_1.js'),'utf8'),{window:sandbox});
const config=sandbox.POLITICAL_PHASE_CONFIG;
const engine=require(path.join(root,'political_phase_engine_v0_77_portraits.js'));
const armyEngine=require(path.join(root,'army_phase2_engine_v0_74_retreat.js'));

const cities={cities:{MA_01:{city_name:'ボストン',state_id:'MA',state_name:'マサチューセッツ'},RI_01:{city_name:'プロビデンス',state_id:'RI',state_name:'ロードアイランド'},VA_01:{city_name:'ウィリアムズバーグ',state_id:'VA',state_name:'バージニア'},ME_01:{city_name:'ハロウェル',state_id:'ME',state_name:'メーン地区'}}};
const military={
  factions:{PATRIOT:{treasury:1375},BRITISH:{treasury:6200}},
  political_phase:{
    foreign_intervention:{PATRIOT:{NETHERLANDS:65,FRANCE:30,SPAIN:75}},
    pending_effects:{
      PATRIOT:{domestic_support:[{city_id:'RI_01',food:300,materials:100},{city_id:'RI_01',food:150,materials:50}],overseas_supply:{FOOD:0,MATERIALS:0}},
      BRITISH:{domestic_support:[],overseas_supply:{FOOD:450,MATERIALS:150}}
    }
  },
  commanders:{
    a:{id:'a',faction:'PATRIOT',name:'グリーン',historical_rank:'少将',role:'通常指揮官'},
    b:{id:'b',faction:'PATRIOT',name:'ワシントン',historical_rank:'大将',role:'総司令官'},
    c:{id:'c',faction:'BRITISH',name:'ゲージ',historical_rank:'大将',role:'総司令官'},
    d:{id:'d',faction:'PATRIOT',name:'予備役',historical_rank:'少将',role:'通常指揮官'}
  },
  field_armies:{
    a1:{id:'a1',commander_id:'a',faction:'PATRIOT',name:'ロードアイランド軍',location_city_id:'RI_01',manpower:3200},
    b1:{id:'b1',commander_id:'b',faction:'PATRIOT',name:'大陸軍主力',location_city_id:'MA_01',manpower:5500},
    c1:{id:'c1',commander_id:'c',faction:'BRITISH',name:'英軍主力',location_city_id:'MA_01',manpower:4200},
    zero:{id:'zero',commander_id:'d',faction:'PATRIOT',name:'消滅軍',location_city_id:'VA_01',manpower:0}
  }
};
const before=JSON.stringify(military);
const pat=model.supplyPlan(military,cities,'PATRIOT',config,engine);
assert.equal(pat.records.length,4,'3 foreign sources and 1 aggregated domestic source');
assert.deepEqual(pat.totals,{food:4650,materials:2150});
assert(pat.records.some(row=>row.source==='オランダ・継続援助'&&row.food===1800&&row.materials===800));
assert(pat.records.some(row=>row.source==='フランス・秘密援助'&&row.food===600));
assert(pat.records.some(row=>row.source==='スペイン・本格介入'&&row.food===1800));
assert(pat.records.some(row=>row.source.includes('プロビデンス')&&row.route==='DOMESTIC'&&row.food===450));
const bri=model.supplyPlan(military,cities,'BRITISH',config,engine);
assert.deepEqual(bri.totals,{food:4050,materials:1350});
assert(bri.records.some(row=>row.source==='本国定期補給'&&row.food===3600));
assert(bri.records.some(row=>row.source.includes('追加分')&&row.materials===150));
assert(!bri.records.some(row=>row.source.includes('オランダ')),'foreign shipments belong only to Patriots');

const location={displayLocation:(_state,army)=>army.id==='a1'?{city_id:'VA_01',origin_city_id:'RI_01',reinforcement:true}:{city_id:army.location_city_id}};
const deployed=model.deployedCommanders(military,cities,'PATRIOT',location);
assert.equal(deployed.length,2,'reserve and eliminated unit do not count as deployed');
assert.equal(deployed[0].name,'ワシントン','chief first');
assert.equal(deployed[1].cityName,'ウィリアムズバーグ','reinforcement shown at battle site');
assert.equal(deployed[0].stateName,'マサチューセッツ州');
assert.equal(deployed[1].stateName,'バージニア州','reinforcement state is battle site, not origin');
assert(deployed[1].locationNote.includes('プロビデンス発'));
const maineExample=JSON.parse(JSON.stringify(military));maineExample.field_armies.b1.location_city_id='ME_01';
assert.equal(model.deployedCommanders(maineExample,cities,'PATRIOT',location)[0].stateName,'マサチューセッツ州・メーン地区');
assert.equal(model.deployedCommanders(military,cities,'BRITISH',location).length,1);
const lostArmyExample=JSON.parse(JSON.stringify(military));lostArmyExample.commanders.d.role='方面軍司令官';
assert.equal(model.deployedCommanders(lostArmyExample,cities,'PATRIOT',location).length,2);
assert.equal(model.theaterCommanderCount(lostArmyExample,'PATRIOT'),1,'appointment limit counts theater commanders even when their army is gone');
assert.equal(JSON.stringify(military),before,'projection must not mutate military state');
assert.throws(()=>armyEngine.improveFieldArmy({runtime_flow_phase:'POLITICAL'},'a1','TRAINING',{},{}),/POLITICAL_PHASE_READ_ONLY/,'engine also rejects a political-phase army order');

const armyUI=fs.readFileSync(path.join(root,'army_phase2_ui_v0_77_portraits.js'),'utf8');
const tabsUI=fs.readFileSync(path.join(root,'political_tabs_ui_v0_72_commanders.js'),'utf8');
const html=fs.readFileSync(path.join(root,'game.html'),'utf8');
assert(armyUI.includes("state.runtime_flow_phase==='POLITICAL'"));
assert(armyUI.includes("if(politicalArmyReadOnly()){cancelArmyAction();return;}"));
assert(armyUI.includes("if(!openedArmyId||politicalArmyReadOnly()){cancelArmyAction();return;}"));
assert(armyUI.includes("button.disabled=true;"),'all army action buttons disabled in political phase');
assert(tabsUI.includes('配備済み将軍一覧を見る'));
assert(tabsUI.includes("referenceText(right,item.stateName,'pv-roster-state')"));
assert(tabsUI.includes('軍資金は議決により国庫・軍事予算から拠出され、指令フェーズで使用できる資金となります。'));
assert(tabsUI.includes('表示は予定量です。制海権・港湾事情で到着量は減少します。また都市の備蓄上限を超える分は廃棄されます。'));
assert(tabsUI.includes('window.__phase2UI.openArmy(item.armyId)'));
const refSrc=html.indexOf('src="political_reference_model_v1.js"'),tabsSrc=html.indexOf('src="political_tabs_ui_v0_72_commanders.js');
assert(refSrc>=0&&tabsSrc>refSrc,'model loads before political tabs');
console.log('PASS: foreign/home/domestic supply projections, both factions, active roster, read-only command guards, script order');
