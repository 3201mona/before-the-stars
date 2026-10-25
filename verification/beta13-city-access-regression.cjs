'use strict';
// β13候補：地図の部隊旗が都市ポリゴンを覆っても、情報欄から都市を選択できることを検査。
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const citySource=fs.readFileSync(path.join(root,'runtime/canonical_city_runtime_v0_74_retreat.js'),'utf8');
const armySource=fs.readFileSync(path.join(root,'runtime/army_phase2_ui_v0_77_portraits.js'),'utf8');
const html=fs.readFileSync(path.join(root,'runtime/game.html'),'utf8');
const dataPrefix='window.CITY_COMMAND_DATA=';
const dataEnd=citySource.indexOf(';window.CITY_COMMAND_CONFIG=');
assert.ok(citySource.startsWith(dataPrefix)&&dataEnd>dataPrefix.length,'都市の基準データが抽出できる');
const cityData=JSON.parse(citySource.slice(dataPrefix.length,dataEnd));
const cities=cityData.cities;
assert.equal(Object.keys(cities).length,50,'都市ID50件を維持');

class MockElement{
  constructor(tag='div'){
    this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.handlers={};
    this.hidden=false;this.className='';this.textContent='';this.value='';this.focused=false;
  }
  append(...children){this.children.push(...children);}
  appendChild(child){this.append(child);return child;}
  replaceChildren(...children){this.children=children;}
  addEventListener(type,callback){(this.handlers[type]??=[]).push(callback);}
  setAttribute(name,value){this.attributes[name]=value;}
  focus(){this.focused=true;}
  click(){for(const callback of this.handlers.click||[])callback({target:this});}
}
const ids=['state-city-links','city-navigation-groups','city-navigation-modal','city-navigation-search','city-navigation-trigger'];
const elements=Object.fromEntries(ids.map(id=>[id,new MockElement()]));
const cityTab=new MockElement('button');let switchedToCity=0;let selectedId=null;
cityTab.addEventListener('click',()=>{switchedToCity++;});
const document={createElement:tag=>new MockElement(tag),querySelector:selector=>selector==='[data-info-tab="city"]'?cityTab:null};
const start=citySource.indexOf('  const CITY_STATE_ORDER=');
const end=citySource.indexOf('\n  function reinforcementAttackTargets(',start);
assert.ok(start>0&&end>start,'都市導線の実装コードを抽出');
const funcs=vm.runInNewContext(`${citySource.slice(start,end)}\n({cityStateLabel,renderStateCityLinks,renderCityNavigation,openCityNavigation,closeCityNavigation})`,{
  state:{cities},document,$:id=>elements[id],selectCity:id=>{selectedId=id;},
});
const descendants=element=>[element,...element.children.flatMap(descendants)];
const buttons=element=>descendants(element).filter(node=>node.tagName==='button');
const labels=element=>descendants(element).map(node=>node.textContent).filter(Boolean);

// 全都市検索、州別グループ、都市名/州名フィルタ。
funcs.renderCityNavigation();
assert.equal(buttons(elements['city-navigation-groups']).length,50,'都市選択メニューの50都市');
assert.equal(descendants(elements['city-navigation-groups']).filter(el=>el.className==='city-navigation-group').length,14,'州・地区14グループ');
funcs.renderCityNavigation('プロビデンス');
let matches=buttons(elements['city-navigation-groups']);
assert.equal(matches.length,1,'プロビデンスの都市名検索');
assert.equal(matches[0].dataset.cityId,'RI_01','プロビデンスの都市ID');
funcs.renderCityNavigation('ロードアイランド');
assert.equal(buttons(elements['city-navigation-groups']).length,Object.values(cities).filter(c=>c.state_id==='RI').length,'州名検索');
funcs.renderCityNavigation('存在しない都市');
assert.ok(labels(elements['city-navigation-groups']).includes('該当する都市がありません'),'検索結果なしを表示');

// ユーザー操作：メニュー→プロビデンス→都市情報タブ。
funcs.openCityNavigation();
assert.equal(elements['city-navigation-modal'].hidden,false,'都市選択画面を開く');
assert.equal(elements['city-navigation-groups'].children.length,14,'検索条件をリセットして全州を表示');
funcs.renderCityNavigation('プロビデンス');
buttons(elements['city-navigation-groups'])[0].click();
assert.equal(selectedId,'RI_01','地図のクリックなしで都市を選択');
assert.equal(switchedToCity,1,'都市情報タブに切り替える');
assert.equal(elements['city-navigation-modal'].hidden,true,'選択後にメニューが閉じる');

// マサチューセッツ州情報は本土4＋メーン3を地区ごとに表示。
const massCities=Object.values(cities).filter(c=>['MA','ME'].includes(c.state_id));
funcs.renderStateCityLinks('MA',massCities);
assert.equal(buttons(elements['state-city-links']).length,7,'州情報の7都市リンク');
assert.ok(labels(elements['state-city-links']).includes('マサチューセッツ本土'));
assert.ok(labels(elements['state-city-links']).includes('メーン地区'));
const maButton=buttons(elements['state-city-links']).find(node=>node.dataset.cityId==='MA_01');
assert.ok(maButton,'本土の都市へ飛べる');maButton.click();assert.equal(selectedId,'MA_01');
const maineButton=buttons(elements['state-city-links']).find(node=>node.dataset.cityId==='ME_01');
assert.ok(maineButton,'メーン地区からも飛べる');maineButton.click();assert.equal(selectedId,'ME_01');
funcs.renderStateCityLinks('RI',Object.values(cities).filter(c=>c.state_id==='RI'));
assert.ok(buttons(elements['state-city-links']).some(node=>node.dataset.cityId==='RI_01'),'ロードアイランド州情報→プロビデンス');

// 部隊詳細の所在地ボタン→都市情報タブも、実際のイベントハンドラを抽出して動かす。
const linkEvent=armySource.match(/armyLocationLink\.addEventListener\('click',\(\)=>\{[^\n]+?\}\);/);
assert.ok(linkEvent,'部隊所在ボタンにクリック導線');
const armyLocationLink=new MockElement('button');let armyModalClosed=0,armyTabSwitched=0,armySelected=null;
armyLocationLink.dataset.cityId='RI_01';
const armyCityTab=new MockElement('button');armyCityTab.addEventListener('click',()=>{armyTabSwitched++;});
vm.runInNewContext(linkEvent[0],{
  armyLocationLink,closeArmy:()=>{armyModalClosed++;},
  window:{CITY_COMMAND_DATA:{cities},__cityCommandUI:{selectCity:id=>{armySelected=id;}}},
  document:{querySelector:selector=>selector==='[data-info-tab="city"]'?armyCityTab:null},
});
armyLocationLink.click();
assert.equal(armySelected,'RI_01','部隊所在の都市を選択');
assert.equal(armyModalClosed,1,'部隊画面を閉じる');
assert.equal(armyTabSwitched,1,'都市情報へ切り替える');
armyLocationLink.dataset.cityId='UNKNOWN';armyLocationLink.click();
assert.equal(armyModalClosed,1,'都市IDが無効なら遷移しない');
assert.match(armySource,/\$\('army-location'\)\.dataset\.cityId=city\.city_id/,'表示中の所在都市IDをリンクに設定');
assert.match(armySource,/window\.__cityCommandUI\?\.selectCity\?\.\(cityId\)/,'部隊所在から都市情報を選択');
assert.match(html,/canonical_city_runtime_v0_74_retreat\.js\?v=20261025-beta13-city-access-dev/,'都市情報スクリプトのキャッシュ更新');
assert.match(html,/army_phase2_ui_v0_77_portraits\.js\?v=20261025-beta13-city-access-dev/,'部隊UIスクリプトのキャッシュ更新');
assert.match(html,/strategy_map_zoom_v1\.js/,'既存の地図ズームを保つ');

// 現物SVGのプロビデンス都市形状と、野戦軍旗の配置・透明ヒットボックスを比較。
const providencePath=html.match(/<path class="unit-click" d="([^"]+)"[^>]*id="unit-RI_01"/);
assert.ok(providencePath,'プロビデンスの承認済みクリック領域を取得');
const points=[...providencePath[1].matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
assert.ok(points.length>3,'プロビデンスの地図頂点');
const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
const providenceWidth=Math.max(...xs)-Math.min(...xs),providenceHeight=Math.max(...ys)-Math.min(...ys);
assert.equal(providenceWidth,51,'プロビデンスのクリック領域横幅（SVG座標）');
assert.equal(providenceHeight,47,'プロビデンスのクリック領域縦幅（SVG座標）');
assert.match(armySource,/columns=Math\.min\(5,records\.length\)/,'部隊旗は最大5列');
assert.match(armySource,/spread=\(columns-1\)\*15/,'列間隔15');
assert.match(armySource,/width="38" height="44"/,'部隊旗の透明ヒット領域38×44');
const hitboxWidth=38,hitboxHeight=44,columnSpacing=15,rowSpacing=24;
for(const [zoom,expectedWidth] of [[1.5,85.33333333333333],[1.75,81.71428571428572]]){
  const extentWidth=4*columnSpacing+hitboxWidth/zoom;
  const extentHeight=rowSpacing+hitboxHeight/zoom;
  assert.ok(Math.abs(extentWidth-expectedWidth)<1e-6,'旗の幅の計算');
  assert.ok(extentWidth>providenceWidth&&extentHeight>providenceHeight,'10部隊ではプロビデンスの外側にはみ出す');
}
console.log('PASS β13 都市選択メニュー/州内リンク/部隊所在リンク/拡大幅: 50都市、14州地区、回帰成功');
