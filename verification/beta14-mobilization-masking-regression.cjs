/* Royalist overseas mobilization route choice and national manpower display masking. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {ctx,mk,plans}=require('./stage3-battle-scenario.cjs');
const {PoliticalPhaseEngine:P,POLITICAL_PHASE_CONFIG:C}=ctx;
const root=path.resolve(__dirname,'../runtime');
const clone=value=>JSON.parse(JSON.stringify(value));
let count=0;
function test(name,run){run();count++;console.log('PASS',name);}

const chosenPorts=['MA_03','NY_04','SC_04'];
const originalRates={NORTH:1,CENTRAL:.55,SOUTH:.35};
function fixture(faction='BRITISH',rates=originalRates,disabled=[]){
  const {m,c}=mk(plans[1],1024);
  m.political_phase.pending_effects[faction].overseas_manpower=3000;
  m.political_phase.german_auxiliaries.BRITISH=0;
  for(const city of Object.values(c.cities))city.politics.military_control='NEUTRAL';
  for(const id of chosenPorts)c.cities[id].politics.military_control=faction;
  const seen=[];
  const naval={
    isPortOperational:city=>!disabled.includes(city.city_id),
    seaActionProfile:(_cities,zone,side,action)=>{
      assert.equal(side,faction);
      assert.equal(action,'OVERSEAS_SUPPLY');
      seen.push(zone);
      return{arrival_rate:rates[zone],zone_name:`${zone}海域`,stage:{key:zone,label:zone}};
    }
  };
  return{m,c,seen,naval};
}
function resolve(f){const result=P.resolvePoliticalPhaseClose(f.m,f.c,'BRITISH',C,f.naval);const event=result.events.find(e=>e.type==='OVERSEAS_MANPOWER_DELIVERED');return{...result,event};}

test('王党派：容量最大の中央港ではなく到着率最大の北部港を使う',()=>{
  const f=fixture(),before=f.m.factions.BRITISH.mobilizable_manpower;
  assert((f.c.cities.MA_03.capacity.FOOD+f.c.cities.MA_03.capacity.MATERIALS)<(f.c.cities.NY_04.capacity.FOOD+f.c.cities.NY_04.capacity.MATERIALS));
  const out=resolve(f);
  assert.equal(out.event.arrival_rate,1);
  assert.equal(out.event.zone_name,'NORTH海域');
  assert.equal(out.event.arrived,3000);
  assert.equal(out.state.factions.BRITISH.mobilizable_manpower,before+3000);
  assert(f.seen.includes('SOUTH')&&f.seen.includes('CENTRAL')&&f.seen.includes('NORTH'));
  assert.equal(f.m.factions.BRITISH.mobilizable_manpower,before,'input state must stay unchanged');
});
test('王党派：最良港が封鎖されていると次点の中央海域を使う',()=>{
  const f=fixture('BRITISH',originalRates,['MA_03']);
  const out=resolve(f);
  assert.equal(out.event.arrival_rate,.55);
  assert.equal(out.event.zone_name,'CENTRAL海域');
  assert.equal(out.event.arrived,1650);
});
test('王党派：南部のみ使用可能なら損耗65％、無港なら到着0',()=>{
  const south=resolve(fixture('BRITISH',originalRates,['MA_03','NY_04']));
  assert.equal(south.event.arrived,1050);
  assert.equal(south.event.zone_name,'SOUTH海域');
  const none=resolve(fixture('BRITISH',originalRates,chosenPorts));
  assert.equal(none.event.arrived,0);
  assert.equal(none.event.arrival_rate,0);
  assert.equal(none.event.zone_name,null);
});
test('独立派：従来どおり補給港の容量順を維持する',()=>{
  const f=fixture('PATRIOT');
  const out=P.resolvePoliticalPhaseClose(f.m,f.c,'PATRIOT',C,f.naval);
  const arrival=out.events.find(e=>e.type==='OVERSEAS_MANPOWER_DELIVERED');
  assert.equal(arrival.zone_name,'CENTRAL海域');
  assert.equal(arrival.arrived,1650);
});
test('政治状態：JSON保存・復元後も動員令結果を保持する',()=>{
  const f=fixture(),out=resolve(f),saved=clone(out.state);
  assert.equal(saved.factions.BRITISH.mobilizable_manpower,out.state.factions.BRITISH.mobilizable_manpower);
  assert.equal(saved.political_phase.pending_effects.BRITISH.overseas_manpower,0);
});

const politicalUI=fs.readFileSync(path.join(root,'political_phase_ui_v0_73_event_scope.js'),'utf8');
const militaryUI=fs.readFileSync(path.join(root,'army_phase2_ui_v0_77_portraits.js'),'utf8');
test('スペイン本格介入の特別報告：残数の生値を表示しない',()=>{
  const bandStart=politicalUI.indexOf('  function manpowerDisplay('),bandEnd=politicalUI.indexOf('  function manpowerLabelHtml(',bandStart);
  const eventStart=politicalUI.indexOf('  function majorInterventionNotices('),eventEnd=politicalUI.indexOf('  function closeResolutionNotice(',eventStart);
  assert(bandStart>=0&&bandEnd>bandStart&&eventStart>=0&&eventEnd>eventStart);
  const labels=['極めて潤沢','潤沢','充足','平常','不足気味','僅少','枯渇'];
  const mock={window:{CITY_COMMAND_CONFIG:{political_situation:{manpower_labels:labels}}},result:null};
  vm.runInNewContext(`${politicalUI.slice(bandStart,bandEnd)}\n${politicalUI.slice(eventStart,eventEnd)}\nresult=majorInterventionNotices('PATRIOT',[{type:'SPANISH_MANPOWER_SUPPORT',before:37500,after:40500,arrived:3000}]);`,mock);
  const row=mock.result[0].details.find(d=>d.label==='動員可能数');
  const shown=row.segments.map(item=>item.text).join('');
  assert(shown.includes(labels[1])&&shown.includes(labels[0]));
  assert(shown.includes('+3,000名'));
  assert(!shown.includes('37,500')&&!shown.includes('40,500'));
});
test('政治の通常報告：動員令・正規軍増派の増分だけを数字表示',()=>{
  const displayStart=politicalUI.indexOf('  function manpowerDisplay('),displayEnd=politicalUI.indexOf('  function render(',displayStart);
  const closeStart=politicalUI.indexOf('  function closeResolutionNotice('),closeEnd=politicalUI.indexOf('  function commandPhaseIntroNotice(',closeStart);
  assert(displayStart>=0&&displayEnd>displayStart&&closeStart>=0&&closeEnd>closeStart);
  const labels=['動員余力最大','豊富','充足','平常','不足','逼迫','動員不能'];
  const military={calendar:{year:1775,month:6},political_phase:{proposal_history:[]}};
  const mock={window:{__phase2UI:{getState:()=>military},CITY_COMMAND_CONFIG:{political_situation:{manpower_labels:labels},seven_color_palette:labels.map((_,i)=>({color:`#${i}`}))}},result:null};
  const events=[{type:'MANPOWER_MOBILIZED',arrived:3000,before:24000,after:27000},{type:'OVERSEAS_MANPOWER_DELIVERED',requested:3000,arrived:1650,arrival_rate:.55,zone_name:'中部',before:27000,after:28650}];
  vm.runInNewContext(`${politicalUI.slice(displayStart,displayEnd)}\n${politicalUI.slice(closeStart,closeEnd)}\nresult=closeResolutionNotice('BRITISH',${JSON.stringify(events)});`,mock);
  const rendered=mock.result.details.map(item=>item.html||item.text||'').join('\n');
  assert(rendered.includes('動員令')&&rendered.includes('正規軍増派')&&rendered.includes('充足'));
  assert(rendered.includes('+3,000名')&&rendered.includes('+1,650名'));
  for(const raw of ['24,000','27,000','28,650'])assert(!rendered.includes(raw),`masked total ${raw}`);
});
test('守備隊編成・募兵警告：国全体の動員可能残数は段階ラベル',()=>{
  assert(militaryUI.includes('function maskedMobilizable(value)'));
  assert(militaryUI.includes('manpowerRow(Number(state.factions[currentFaction()].mobilizable_manpower),estimate.mobilizable_manpower_cost)'));
  assert(!militaryUI.includes("resourceRow('動員可能数'"));
  assert(militaryUI.includes('現在 ${maskedMobilizable(manpower)}'));
  assert(!militaryUI.includes('現在 ${fmt(manpower)}名'));
  const begin=militaryUI.indexOf('  function maskedMobilizable(value)'),end=militaryUI.indexOf('\n',begin);
  const seven=['濃紺','青','薄青','白','薄赤','赤','濃赤'];
  const mock={window:{PoliticalPhaseEngine:P,CITY_COMMAND_CONFIG:{political_situation:{manpower_labels:seven}}},SEVEN_COLORS:['#a','#b','#c','#d','#e','#f','#g'],actual:null};
  vm.runInNewContext(`${militaryUI.slice(begin,end)}\nactual=maskedMobilizable(37500);`,mock);
  assert(mock.actual.includes('青'));
  assert(!mock.actual.includes('37,500'));
});
test('HTMLの初期国情報・旗配置検証画面にも動員残数の生値を置かない',()=>{
  for(const name of ['game.html','flag-layout-lab.html']){
    const markup=fs.readFileSync(path.join(root,name),'utf8');
    assert.match(markup,/id="political-manpower"[^<]*>充足<\/text>/,name);
    assert(!/id="political-manpower"[^<]*>[\d,]+<\/text>/.test(markup),name);
  }
});
console.log(`PASS: ${count} mobilization and masking checks`);
