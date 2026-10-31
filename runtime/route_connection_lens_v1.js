/* BTS route connection lens, β16-derived review-only feature.
 * Read-only UI; no state changes, commands or modification of canonical topology.
 * Reuses the live strategy map so political phase shows current military geography.
 */
(()=>{
  'use strict';
  const SVG_NS='http://www.w3.org/2000/svg';
  const map=document.getElementById('game-map');
  const panel=document.querySelector('aside.panel');
  const infoTabs=panel?.querySelector('.info-tabs');
  const political=document.getElementById('political-phase-modal');
  if(!map||!panel||!infoTabs||!political||typeof units==='undefined'||typeof topology==='undefined')return;
  const cityIds=Object.keys(units),edgeByCity=new Map(cityIds.map(id=>[id,[]]));
  for(const edge of topology.edges||[]){
    if(String(edge.type).startsWith('water_')||edge.counts_as_land_adjacency===false)continue;
    edgeByCity.get(edge.a)?.push({id:edge.b,type:edge.type});
    edgeByCity.get(edge.b)?.push({id:edge.a,type:edge.type});
  }
  if(cityIds.length!==50||[...edgeByCity.values()].reduce((n,a)=>n+a.length,0)!==208)throw new Error('ROUTE_LENS_CANONICAL_TOPOLOGY_MISMATCH');
  const name=id=>units[id]?.unit_name||id;
  const isPort=id=>units[id]?.naval_class==='PORT';
  const isCoastal=id=>['PORT','LANDING_ONLY'].includes(units[id]?.naval_class);
  const seaPossible=(a,b)=>Boolean(a!==b&&isPort(a)&&isCoastal(b)&&units[a]?.sea_zone&&units[b]?.sea_zone);
  const neighbor=(a,b)=>(edgeByCity.get(a)||[]).find(e=>e.id===b)||null;
  const svg=(tag,attributes={})=>{const e=document.createElementNS(SVG_NS,tag);for(const [k,v] of Object.entries(attributes))e.setAttribute(k,String(v));return e;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const zoneNames={NORTH:'北部海域',CENTRAL:'中部海域',SOUTH:'南部海域'};
  let active=false,context='command',origin='MA_03',target=null,overlayOn=true,lastInfoTab='city';

  const openButton=document.createElement('button');
  openButton.id='route-lens-open-command';openButton.type='button';openButton.className='route-lens-command-launch';
  openButton.innerHTML='<span class="route-lens-launch-icon" aria-hidden="true">◉</span><span>接続</span>';
  openButton.setAttribute('aria-label','接続ハイライトを開く（陸路・海路）');
  openButton.title='接続ハイライト（試作）：起点都市からの陸路と海路を確認';
  infoTabs.classList.add('route-lens-tabs');
  infoTabs.appendChild(openButton);

  // A political map session is not the connection tab: only this explicit action
  // returns to the still-open parliamentary phase.
  const politicalBar=document.createElement('div');
  politicalBar.id='route-lens-political-bar';politicalBar.hidden=true;
  politicalBar.innerHTML='<span>政治フェーズ · 戦略盤参照</span><button id="route-lens-return-political" type="button">↩ 議会へ戻る</button>';
  infoTabs.insertAdjacentElement('beforebegin',politicalBar);

  const dock=document.createElement('section');dock.id='route-lens-dock';dock.hidden=true;dock.setAttribute('aria-label','陸海接続の閲覧パネル');
  dock.innerHTML=`<div class="route-lens-heading"><div><span class="route-lens-kicker">STRATEGIC MAP · VIEW ONLY</span><strong>戦略地図の確認</strong></div><button id="route-lens-close" type="button">閉じる</button></div>
    <div class="route-lens-mode-tabs" role="group" aria-label="地図の表示モード"><button id="route-lens-tab-map" type="button">通常の戦略盤</button><button id="route-lens-tab-connections" type="button">接続表示</button></div>
    <p class="route-lens-plain-note">現在の軍事支配・部隊配置・都市の状況を、そのまま確認できます。接続表示へ切り替えると陸海の直結も調べられます。</p>
    <label class="route-lens-source-label" for="route-lens-source">起点都市を固定</label>
    <select id="route-lens-source">${cityIds.map(id=>`<option value="${esc(id)}">${esc(name(id))}</option>`).join('')}</select>
    <div class="route-lens-help">地図上で目的都市を選ぶと、海路がある場合だけ青い点線を表示します。</div>
    <div class="route-lens-key"><span><i class="route-key-land"></i>直接陸路</span><span><i class="route-key-sea"></i>選択先への海路</span><span class="route-key-port">● 港湾</span><span class="route-key-coast">▲ 上陸</span></div>
    <div class="route-lens-result" aria-live="polite"><div class="route-lens-kicker">CONNECTION</div><div id="route-lens-route-title"></div><div class="route-lens-results"><span id="route-lens-land-result"></span><span id="route-lens-sea-result"></span></div><p id="route-lens-detail"></p></div>
    <p class="route-lens-caution">※地形上の接続を表示。現時点の支配・封鎖・制海権・港湾稼働・命令可否は判定しません。</p>`;
  infoTabs.insertAdjacentElement('afterend',dock);

  const strategicNote=political.querySelector('#pv-strategic-note');
  const politicalButton=document.createElement('button');politicalButton.id='route-lens-open-political';
  politicalButton.type='button';politicalButton.textContent='↗ 戦略地図を見る';politicalButton.title='議会を閉会せず、現在の戦略盤と都市接続を確認';
  if(strategicNote)strategicNote.insertAdjacentElement('afterend',politicalButton);

  const layer=svg('g',{id:'route-lens-layer','aria-label':'都市間接続ハイライト',display:'none'});
  map.appendChild(layer);

  function focusOrigin(){
    const scroller=window.__strategyMapZoom?.scroller,point=units[origin]?.anchor;
    if(!scroller||!point)return;
    const rect=map.getBoundingClientRect(),ratio=rect.width/1448;
    scroller.scrollLeft=Math.max(0,point[0]*ratio-scroller.clientWidth*.52);
    scroller.scrollTop=Math.max(0,point[1]*ratio-scroller.clientHeight*.39);
    window.__strategyMapZoom?.pinPoliticalPanel?.();
  }
  function addLine(x1,y1,x2,y2){
    layer.appendChild(svg('path',{d:`M${x1} ${y1} L${x2} ${y2}`,class:'route-lens-land-shadow'}));
    layer.appendChild(svg('path',{d:`M${x1} ${y1} L${x2} ${y2}`,class:'route-lens-land-line'}));
  }
  function addSeaLine(a,b){
    const [x1,y1]=units[a].anchor,[x2,y2]=units[b].anchor;
    const cx=Math.min(1420,Math.max(x1,x2)+Math.max(170,Math.abs(x1-x2)*.25));
    const d=`M${x1} ${y1} Q${Math.round(cx)} ${Math.round((y1+y2)/2)} ${x2} ${y2}`;
    layer.appendChild(svg('path',{d,class:'route-lens-sea-shadow'}));
    layer.appendChild(svg('path',{d,class:'route-lens-sea-line'}));
  }
  function addCityMarker(id){
    const u=units[id],p=u.anchor;if(!p)return;
    const [x,y]=p,from=id===origin,to=id===target,adj=!!neighbor(origin,id);
    const landing=u.naval_class==='LANDING_ONLY',port=u.naval_class==='PORT';
    const group=svg('g',{class:`route-lens-marker ${from?'origin':to?'target':adj?'neighbor':'other'} ${port?'port':landing?'landing':'inland'}`,'data-route-city':id,role:'button',tabindex:'0','aria-label':`${name(id)}を目的地に選択`});
    const label=svg('title');label.textContent=`${name(id)}：${port?'港湾':landing?'上陸地点':'内陸'}${adj?'・直接陸路あり':''}`;group.appendChild(label);
    group.appendChild(svg('circle',{cx:x,cy:y,r:12,class:'route-lens-hit'}));
    if(landing)group.appendChild(svg('path',{d:`M${x},${y-6} L${x+5},${y+4} L${x-5},${y+4} Z`,class:'route-lens-dot'}));
    else group.appendChild(svg('circle',{cx:x,cy:y,r:from?8:to?7:adj?5.5:3.2,class:'route-lens-dot'}));
    if(from||to)group.appendChild(svg('circle',{cx:x,cy:y,r:from?14:12,class:'route-lens-ring'}));
    layer.appendChild(group);
    if(from||to||adj){
      const text=svg('text',{x:x+(x>1210?-14:14),y:y+(from?-17:to?24:-12),'text-anchor':x>1210?'end':'start',class:'route-lens-city-name'});
      text.textContent=name(id);layer.appendChild(text);
    }
  }
  function updatePanel(){
    const land=target?neighbor(origin,target):null,sea=target?seaPossible(origin,target):false;
    dock.querySelector('#route-lens-source').value=origin;
    dock.querySelector('#route-lens-route-title').textContent=target?`${name(origin)} → ${name(target)}`:`${name(origin)} からの接続`;
    const landResult=dock.querySelector('#route-lens-land-result'),seaResult=dock.querySelector('#route-lens-sea-result');
    landResult.className=target&&!land?'route-badge-muted':'route-badge-land';
    landResult.textContent=target?`━ 陸路：${land?'直結あり':'直結なし'}`:`━ 陸路：${edgeByCity.get(origin).length}都市と直結`;
    seaResult.className=target&&!sea?'route-badge-muted':'route-badge-sea';
    seaResult.textContent=target?`〰 海路：${sea?(isPort(target)?'港湾に到達':'沿岸上陸'):'直接対象外'}`:`〰 海路：${isPort(origin)?'出港可能な地形':'出港できない地形'}`;
    let detail='目的都市を選択すると、この下に接続結果が表示されます。';
    if(target){
      if(land?.type==='strait_crossing')detail='海峡横断はゲーム上の直接陸路です。沿岸上陸は別の接続として区別しています。';
      else if(!land&&sea)detail='この2都市には直接陸路がなく、海上接続のみ存在します。青い線は概念上の航路です。';
      else if(land&&sea)detail='陸路と海路の両方がある都市間です。金線が直接陸路を表します。';
      else if(land)detail='金線はゲーム内で認められる直接の陸路接続です。';
      else detail='直接陸路も、起点からの海上接続もありません。経由地を使う移動とは別です。';
      if(sea)detail+=` 経由海域：${[origin,target].map(id=>zoneNames[units[id]?.sea_zone]||'—').filter((v,i,a)=>a.indexOf(v)===i).join(' → ')}。`;
    }
    dock.querySelector('#route-lens-detail').textContent=detail;
  }
  function updateMode(){
    dock.classList.toggle('route-lens-plain',!overlayOn);
    dock.querySelector('#route-lens-tab-map').setAttribute('aria-pressed',String(!overlayOn));
    dock.querySelector('#route-lens-tab-connections').setAttribute('aria-pressed',String(overlayOn));
  }
  function render(){
    layer.replaceChildren();
    updateMode();
    if(!active||!overlayOn){layer.setAttribute('display','none');return;}
    layer.removeAttribute('display');
    const [x,y]=units[origin].anchor;
    for(const e of edgeByCity.get(origin)){const [tx,ty]=units[e.id].anchor;addLine(x,y,tx,ty);}
    if(target&&seaPossible(origin,target))addSeaLine(origin,target);
    for(const id of cityIds)if(id!==origin&&id!==target)addCityMarker(id);
    if(target)addCityMarker(target);
    addCityMarker(origin);
    updatePanel();
  }
  function chooseDestination(id){if(!units[id])return;target=id===origin?null:id;render();}
  const infoButton=tab=>infoTabs.querySelector(`[data-info-tab="${tab}"]`);
  function showConnections(){
    overlayOn=true;dock.hidden=false;
    for(const tab of infoTabs.querySelectorAll('[data-info-tab]'))tab.classList.remove('active');
    for(const id of ['city-info','state-info','naval-info']){
      const card=document.getElementById(id);if(card)card.hidden=true;
    }
    openButton.classList.add('active');openButton.setAttribute('aria-pressed','true');
    dock.querySelector('#route-lens-close').textContent=context==='political'?'接続表示を閉じる':'接続確認を閉じる';
    render();panel.scrollTop=0;
  }
  function onInfoTab(tab){
    if(!active)return;
    if(context==='command'){close();return;}
    lastInfoTab=tab;
    overlayOn=false;dock.hidden=true;openButton.classList.remove('active');openButton.setAttribute('aria-pressed','false');
    render();
  }
  function showInfoTab(tab='city'){
    const button=infoButton(tab)||infoButton('city');
    button?.click();
  }
  function activate(nextContext){
    if(active)return;
    context=nextContext;
    if(context==='political'){
      if(political.hidden)return;
      political.hidden=true;
    }
    const selected=window.__cityCommandUI?.getSelection?.()?.selectedId;
    if(units[selected])origin=selected;
    lastInfoTab=infoTabs.querySelector('[data-info-tab].active')?.dataset.infoTab||'city';
    target=null;active=true;document.body.classList.add('route-lens-mode');
    if(context==='political'){
      window.__cityCommandUI?.cancelCommand?.();
      document.body.classList.add('route-lens-political');politicalBar.hidden=false;
      showInfoTab('city');
    }else showConnections();
    panel.scrollTop=0;requestAnimationFrame(focusOrigin);
  }
  function close(){
    if(!active)return;
    active=false;overlayOn=false;dock.hidden=true;politicalBar.hidden=true;
    openButton.classList.remove('active');openButton.setAttribute('aria-pressed','false');
    document.body.classList.remove('route-lens-mode','route-lens-political');render();
    showInfoTab(lastInfoTab);
    if(context==='political'&&window.__phase2UI?.getState?.()?.runtime_flow_phase==='POLITICAL')political.hidden=false;
  }
  function interceptMap(event){
    if(!active)return;
    if(context==='political'&&!overlayOn&&!['click','dblclick'].includes(event.type))return;
    const marker=event.target.closest?.('[data-route-city]');
    const territory=event.target.closest?.('.unit-click[id^="unit-"]');
    const id=marker?.getAttribute('data-route-city')||territory?.id?.slice('unit-'.length);
    if(event.type==='click'&&units[id]){
      if(overlayOn)chooseDestination(id);
      else{window.__cityCommandUI?.selectCity?.(id);showInfoTab('city');}
    }
    event.preventDefault();event.stopImmediatePropagation();
  }
  for(const event of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','contextmenu','touchstart'])map.addEventListener(event,interceptMap,true);
  map.addEventListener('keydown',event=>{
    if(!active||!['Enter',' '].includes(event.key))return;
    const marker=event.target.closest?.('[data-route-city]');
    if(marker)chooseDestination(marker.getAttribute('data-route-city'));
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  // Original city/state/naval cards are informational, including commander
  // disclosure and state-city links. Their command areas are hidden separately.
  const allowedPoliticalInfo=target=>Boolean(target.closest('#route-lens-political-bar,[data-info-tab],#city-info,#state-info,#naval-info'));
  infoTabs.addEventListener('click',event=>{
    const tab=event.target.closest('[data-info-tab]');
    if(tab)onInfoTab(tab.dataset.infoTab);
  },true);
  panel.addEventListener('click',event=>{
    if(!active||event.target.closest('#route-lens-dock,#route-lens-open-command'))return;
    if(context==='political'&&allowedPoliticalInfo(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  panel.addEventListener('keydown',event=>{
    if(!active||event.target.closest('#route-lens-dock'))return;
    if(context==='political'&&allowedPoliticalInfo(event.target))return;
    if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  openButton.addEventListener('click',()=>{
    if(!active)activate('command');
    else if(context==='political')showConnections();
    else close();
  });
  politicalButton.addEventListener('click',()=>activate('political'));
  politicalBar.querySelector('#route-lens-return-political').addEventListener('click',close);
  dock.querySelector('#route-lens-close').addEventListener('click',()=>context==='political'?showInfoTab('city'):close());
  dock.querySelector('#route-lens-tab-map').addEventListener('click',()=>{
    if(context==='political')showInfoTab('city');
    else{overlayOn=false;render();}
  });
  dock.querySelector('#route-lens-tab-connections').addEventListener('click',showConnections);
  dock.querySelector('#route-lens-source').addEventListener('change',event=>{
    if(!units[event.target.value])return;
    origin=event.target.value;target=null;render();requestAnimationFrame(focusOrigin);
  });
  window.__routeConnectionLens={open:activate,close,setOrigin:id=>{if(!units[id])return;origin=id;target=null;render();},setTarget:chooseDestination,getState:()=>({active,context,origin,target,overlayOn,infoTab:infoTabs.querySelector('[data-info-tab].active')?.dataset.infoTab||'connections',landNeighbors:edgeByCity.get(origin).map(e=>e.id)})};
})();
