/*
 * BEFORE THE STARS β13 — 軍旗配置専用テスト
 * 正規版は変更しない。実軍旗描画関数が作った SVG 要素を再配置する。
 * テスト部隊は仮想データ。攻撃・政治・ターン進行等の検証には使用しない。
 */
(function(){
  'use strict';
  if(!window.__BTS_FLAG_LAB_ONLY)return;

  const CASES=[
    {key:'ri',label:'プロビデンス ⇔ ニューポート',cities:['RI_01','RI_02']},
    {key:'ma',label:'プリマス ⇔ プロビデンス',cities:['MA_04','RI_01']},
    {key:'nj',label:'モリスタウン ⇔ ニューアーク',cities:['NJ_02','NJ_03']},
    {key:'de',label:'トレントン ⇔ ニューキャッスル',cities:['NJ_01','DE_02']}
  ];
  const SVG_WIDTH=1448, SVG_HEIGHT=1086;
  const LAB_ARMY_PREFIX='ARM_BTS_FLAG_LAB_';
  const LAB_COMMANDER_PREFIX='CMD_BTS_FLAG_LAB_';
  const $=id=>document.getElementById(id);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const config={pair:'ri',count:10,layout:'A',shift:'optimized',zoom:1.5,mode:'army'};
  let baseState=null,updating=false,lastOffsets={},lastMessage='';
  let ui=null,scroller=null,observer=null,toolbar=null;

  const style=document.createElement('style');
  style.textContent=`
    #bts-flag-lab{position:relative;z-index:500;background:#122b38;color:#eaf1ec;
      border:2px solid #e8ba61;border-radius:8px;padding:10px;margin:0 0 12px;
      box-shadow:0 3px 12px #0007;font:13px/1.5 system-ui,"Yu Gothic",sans-serif}
    #bts-flag-lab h2{font-size:16px;line-height:1.3;margin:0 0 7px;color:#ffe08f}
    #bts-flag-lab .lab-badge{font-size:11px;padding:2px 5px;border-radius:4px;background:#9b2932;color:white}
    #bts-flag-lab .lab-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px}
    #bts-flag-lab label{display:block;margin:0;color:#b9d8e7;font-size:12px}
    #bts-flag-lab select{display:block;width:100%;padding:5px 4px;border-radius:4px;
      border:1px solid #7291a1;background:#10202b;color:#fff;font-size:13px}
    #bts-flag-lab .lab-wide{grid-column:1 / -1}
    #bts-flag-lab button{margin:7px 5px 0 0;padding:5px 8px;font-size:13px}
    #bts-flag-lab .lab-status{margin-top:6px;white-space:pre-line;font-size:12px;
      color:#e9f4df;min-height:26px;border-top:1px solid #405e6a;padding-top:5px}
    #bts-flag-lab .lab-note{margin-top:5px;font-size:11px;color:#e3b8b2}
    #bts-flag-lab .lab-legend{font-size:12px;color:#9fc5e8;margin-bottom:6px}
    #bts-flag-lab .lab-error{color:#ffb0af;font-weight:700}
  `;
  document.head.appendChild(style);

  function chosenCase(){return CASES.find(c=>c.key===config.pair)||CASES[0];}
  function status(message,error=false){
    lastMessage=message;
    const node=$('lab-status');
    if(node){node.textContent=message;node.classList.toggle('lab-error',error);}
  }
  function option(value,label){return '<option value="'+value+'">'+label+'</option>';}
  function installControls(){
    toolbar=document.createElement('section');
    toolbar.id='bts-flag-lab';
    toolbar.setAttribute('aria-label','軍旗表示の比較専用ツール');
    toolbar.innerHTML=`
      <h2>軍旗配置テスト <span class="lab-badge">正式版には未適用</span></h2>
      <div class="lab-legend">独立派（青）と王党派（赤）を隣接都市に仮配置。元のゲームの SVG 軍旗で表示します。</div>
      <div class="lab-grid">
        <label class="lab-wide">比較都市<select id="lab-case">
          ${CASES.map(c=>option(c.key,c.label)).join('')}
        </select></label>
        <label>配置案<select id="lab-layout">
          ${option('A','A：5列（従来型）')}
          ${option('B','B：4列（試案）')}
        </select></label>
        <label>各都市の部隊数<select id="lab-count">
          ${option('10','10対10')}${option('8','8対8')}${option('7','7対7')}
        </select></label>
        <label>地図の倍率<select id="lab-zoom">
          ${option('1.5','150%')}${option('1.75','175%')}
        </select></label>
        <label>軍旗群の位置<select id="lab-shift">
          ${option('optimized','都市ごとにずらす')}
          ${option('center','都市中心（現行基準）')}
        </select></label>
        <label class="lab-wide">クリック操作モード<select id="lab-mode">
          ${option('army','軍旗をクリック → 部隊詳細')}
          ${option('city','軍旗を透過 → 下の都市を選択')}
        </select></label>
      </div>
      <div>
        <button id="lab-focus" type="button">対象地域を中央に表示</button>
        <button id="lab-reload" type="button">テスト配置を戻す</button>
      </div>
      <div id="lab-status" class="lab-status" role="status"></div>
      <div class="lab-note">比較専用。攻撃・補給・月次・AIは試験対象外。通常版とはセーブを分離しています。</div>
    `;
    document.querySelector('aside.panel')?.prepend(toolbar);
    for(const [key,id,convert] of [
      ['pair','lab-case',String],['count','lab-count',Number],['layout','lab-layout',String],
      ['zoom','lab-zoom',Number],['shift','lab-shift',String],['mode','lab-mode',String]
    ]){
      const control=$(id);
      control.value=String(config[key]);
      control.addEventListener('change',()=>{
        config[key]=convert(control.value);
        if(key==='pair'||key==='count')applyScenario();
        else if(key==='zoom'){applyZoom();rebuildMarkers();focusMap();}
        else relayout();
      });
    }
    $('lab-focus').addEventListener('click',focusMap);
    $('lab-reload').addEventListener('click',applyScenario);
    // 誤って試験用の部隊で月次を進めないようにする。
    if($('next-month')){$('next-month').disabled=true;$('next-month').title='軍旗比較版では月次進行を無効化しています';}
    if($('command-execute')){$('command-execute').disabled=true;$('command-execute').title='軍旗比較版では命令の確定を無効化しています';}
    $('game-map')?.addEventListener('click',event=>{
      const army=event.target.closest?.('[data-army-id]');
      const city=event.target.closest?.('[data-unit]')||event.target.closest?.('.unit-click');
      if(army)status('軍旗クリック：'+army.dataset.armyId+'（元の部隊詳細ウィンドウを確認してください）');
      else if(city)status('都市クリック：'+(city.dataset.unit||city.id||'都市')+'（都市情報と選択結果を確認してください）');
    },true);
  }

  function createTestState(){
    const state=clone(baseState),test=chosenCase(),templates={};
    for(const faction of ['PATRIOT','BRITISH']){
      templates[faction]={
        commander:Object.values(baseState.commanders).find(c=>c.faction===faction),
        army:Object.values(baseState.field_armies).find(a=>a.faction===faction)
      };
      if(!templates[faction].commander||!templates[faction].army)throw new Error('元の軍団データを取得できません');
    }
    // 原初配置の正規軍はテスト部隊ではないため外す。
    // 兵数0の軍団を残すと本来の軍事データ検証に違反する。
    state.field_armies={};
    for(const commander of Object.values(state.commanders))commander.assigned_army_id=null;
    test.cities.forEach((cityId,side)=>{
      const faction=side===0?'PATRIOT':'BRITISH',template=templates[faction];
      for(let index=0;index<config.count;index++){
        const commanderId=LAB_COMMANDER_PREFIX+faction+'_'+String(index+1).padStart(2,'0');
        const armyId=LAB_ARMY_PREFIX+faction+'_'+String(index+1).padStart(2,'0');
        const commander=clone(template.commander);
        Object.assign(commander,{id:commanderId,name:(faction==='PATRIOT'?'独立派':'王党派')+'試験将軍'+(index+1),
          faction,historical_rank:'試験将軍',role:'一般将軍',portrait:null,traits:[],assigned_army_id:armyId});
        const army=clone(template.army);
        Object.assign(army,{id:armyId,name:'軍旗比較専用 '+(index+1),faction,commander_id:commanderId,
          location_city_id:cityId,manpower:1000+index*100,acted_this_month:false,battle_id:null});
        delete army.reinforcement_role;delete army.supply_cut;delete army.sea_supply_blockaded;
        state.commanders[commanderId]=commander;
        state.field_armies[armyId]=army;
      }
    });
    return state;
  }
  function applyScenario(){
    if(!ui||!baseState)return;
    updating=true;
    try{
      ui.setState(createTestState());
      rebuildMarkers();
      focusMap();
    }catch(error){status('試験データの設定に失敗：'+error.message,true);}
    finally{updating=false;}
  }
  function applyZoom(){
    const map=$('game-map'),wrap=$('map-wrap');
    if(!map||!wrap)return;
    map.style.setProperty('width',wrap.clientWidth*config.zoom+'px','important');
    if(window.__strategyMapZoom){
      window.__strategyMapZoom.factor=config.zoom;
      window.__strategyMapZoom.markerScale=1/config.zoom;
    }
    pinPoliticalPanel();
  }
  function pinPoliticalPanel(){
    const panel=$('political-situation-window'),map=$('game-map');
    if(!panel||!map||!scroller)return;
    const rect=map.getBoundingClientRect(),xScale=rect.width/SVG_WIDTH,yScale=rect.height/SVG_HEIGHT;
    if(xScale&&yScale)panel.setAttribute('transform',
      'translate('+(scroller.scrollLeft/xScale)+' '+(scroller.scrollTop/yScale)+') scale('+(1/config.zoom)+')');
  }
  function focusMap(){
    const map=$('game-map');if(!map||!scroller)return;
    const bboxes=chosenCase().cities.map(id=>$('unit-'+id)?.getBBox()).filter(Boolean);
    if(!bboxes.length)return;
    const midx=bboxes.reduce((s,b)=>s+b.x+b.width/2,0)/bboxes.length;
    const midy=bboxes.reduce((s,b)=>s+b.y+b.height/2,0)/bboxes.length;
    const size=map.getBoundingClientRect(),scale=size.width/SVG_WIDTH;
    scroller.scrollLeft=Math.max(0,midx*scale-scroller.clientWidth/2);
    scroller.scrollTop=Math.max(0,midy*scale-scroller.clientHeight/2);
    requestAnimationFrame(pinPoliticalPanel);
  }
  function markerPoints(box,n,layout){
    const columns=Math.min(layout==='A'?5:4,n),cx=box.x+box.width/2,cy=box.y+box.height/2;
    const points=[];
    for(let index=0;index<n;index++){
      const col=index%columns,row=Math.floor(index/columns);
      // Aはβ13の実装に準拠、Bは最終行を中央に寄せた4列案。
      const rowSize=layout==='B'?Math.min(columns,n-row*columns):columns;
      const spread=(rowSize-1)*15;
      const x=cx-spread/2+col*15;
      const y=cy-12+row*24-(n>5?9:0);
      points.push({x,y});
    }
    return points;
  }
  function bounds(points,zoom){
    return {l:Math.min(...points.map(p=>p.x-12/zoom)),
      t:Math.min(...points.map(p=>p.y-15/zoom)),
      r:Math.max(...points.map(p=>p.x+26/zoom)),
      b:Math.max(...points.map(p=>p.y+29/zoom))};
  }
  function overlapArea(a,b,oa,ob){
    return Math.max(0,Math.min(a.r+oa.dx,b.r+ob.dx)-Math.max(a.l+oa.dx,b.l+ob.dx))*
      Math.max(0,Math.min(a.b+oa.dy,b.b+ob.dy)-Math.max(a.t+oa.dy,b.t+ob.dy));
  }
  function inMap(r,d){return r.l+d.dx>=0&&r.t+d.dy>=0&&r.r+d.dx<=SVG_WIDTH&&r.b+d.dy<=SVG_HEIGHT;}
  function selectOffsets(points0,points1){
    if(config.shift==='center')return [{dx:0,dy:0},{dx:0,dy:0}];
    const a=bounds(points0,config.zoom),b=bounds(points1,config.zoom);
    const shifts=[],range=55;
    for(let dx=-range;dx<=range;dx+=5){
      for(let dy=-range;dy<=range;dy+=5){
        const d={dx,dy};
        if(inMap(a,d)||inMap(b,d))shifts.push(d);
      }
    }
    let best=null,bestScore=Infinity;
    for(const da of shifts){
      if(!inMap(a,da))continue;
      for(const db of shifts){
        if(!inMap(b,db))continue;
        const collisions=overlapArea(a,b,da,db);
        const penalty=(da.dx*da.dx+da.dy*da.dy+db.dx*db.dx+db.dy*db.dy);
        const score=collisions*100000+penalty;
        if(score<bestScore){bestScore=score;best=[da,db];}
      }
    }
    return best||[{dx:0,dy:0},{dx:0,dy:0}];
  }
  function applyMode(){
    const layer=$('field-army-markers');
    if(!layer)return;
    for(const marker of layer.querySelectorAll('.field-army-marker'))
      marker.style.pointerEvents=config.mode==='city'?'none':'all';
  }
  function relayout(){
    if(updating)return;
    const layer=$('field-army-markers');if(!layer)return;
    const cities=chosenCase().cities;
    const entries=cities.map(cityId=>{
      const polygon=$('unit-'+cityId);if(!polygon)return null;
      const markerNodes=[...layer.querySelectorAll('.field-army-marker')].filter(g=>g.dataset.displayedCityId===cityId);
      return {cityId,markerNodes,points:markerPoints(polygon.getBBox(),markerNodes.length,config.layout)};
    });
    if(entries.some(e=>!e||e.markerNodes.length!==config.count)){
      status('軍旗の描画待ち、または対象都市の部隊数が一致していません',true);
      return;
    }
    const offsets=selectOffsets(entries[0].points,entries[1].points);
    entries.forEach((entry,index)=>{
      const offset=offsets[index];
      entry.markerNodes.forEach((marker,i)=>{
        const p=entry.points[i];
        marker.setAttribute('transform','translate('+(p.x+offset.dx)+' '+(p.y+offset.dy)+')');
        const glyph=marker.querySelector('.field-army-marker-glyph');
        if(glyph)glyph.setAttribute('transform','scale('+(1/config.zoom)+')');
      });
      lastOffsets[entry.cityId]={...offset};
    });
    applyMode();
    const a=bounds(entries[0].points,config.zoom),b=bounds(entries[1].points,config.zoom);
    const area=overlapArea(a,b,offsets[0],offsets[1]);
    const actual=entries.map(e=>e.markerNodes.length).join('対');
    status(config.layout+'案・'+actual+'・'+Math.round(config.zoom*100)+'％ | '+
      (area===0?'都市間の軍旗群外接矩形：重複なし':'外接矩形が重複：目視確認必要')+
      '\nオフセット '+cities[0]+':('+offsets[0].dx+','+offsets[0].dy+') '+
      cities[1]+':('+offsets[1].dx+','+offsets[1].dy+')');
  }
  function rebuildMarkers(){
    if(!ui)return;
    applyZoom();
    ui.renderArmyMarkers();
    // 軍旗はβ13正規描画を通してから、位置と倍率だけテスト設定で変更する。
    requestAnimationFrame(relayout);
  }
  function attachObserver(){
    const layer=$('field-army-markers');if(!layer)return;
    observer=new MutationObserver(()=>requestAnimationFrame(relayout));
    observer.observe(layer,{childList:true});
  }
  function start(){
    document.title='BEFORE THE STARS — 軍旗配置比較テスト（β13）';
    ui=window.__phase2UI;
    scroller=$('strategy-map-scroll');
    if(!ui?.getState||!ui?.setState||!ui?.renderArmyMarkers||!scroller)throw new Error('β13軍旗描画APIを確認できません');
    baseState=ui.getState();
    // 検証ページは陣営選択・オープニングを経ずに比較画面を表示する。
    // このスクリプトは専用HTMLだけが読み込むため、通常版の起動は変えない。
    if($('game-start-screen'))$('game-start-screen').hidden=true;
    installControls();
    attachObserver();
    scroller.addEventListener('scroll',()=>requestAnimationFrame(()=>requestAnimationFrame(pinPoliticalPanel)),{passive:true});
    window.addEventListener('resize',()=>requestAnimationFrame(()=>{applyZoom();relayout();}),{passive:true});
    applyScenario();
    window.__BTSFlagLab={getConfig:()=>clone(config),getOffsets:()=>clone(lastOffsets),
      getStatus:()=>lastMessage,rebuild:applyScenario};
  }
  let attempts=0;
  const poll=setInterval(()=>{
    if(!window.__PHASE2_READY||!window.__cityCommandUI){if(++attempts<80)return;}
    clearInterval(poll);
    try{start();}catch(error){
      const box=document.createElement('div');
      box.textContent='軍旗比較テストの初期化に失敗：'+error.message;
      box.style.cssText='position:fixed;z-index:9999;top:0;right:0;background:#7e2028;color:white;padding:15px';
      document.body.appendChild(box);console.error(error);
    }
  },100);
})();
