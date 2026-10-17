(function(){
  'use strict';
  const M=window.StrategyBattleMapModel,NS='http://www.w3.org/2000/svg',$=id=>document.getElementById(id);
  const map=$('game-map'),scroll=$('strategy-map-scroll');
  if(!M||!map||!scroll||window.__strategyBattleMap)return;
  const svg=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const title=(parent,text)=>parent.appendChild(svg('title')).textContent=text;
  const routesLayer=svg('g',{id:'strategy-battle-routes',class:'strategy-route-layer'}),controlLayer=svg('g',{id:'strategy-military-control',class:'strategy-control-layer'});
  const overlay=el('div','strategy-battle-overlay');overlay.id='strategy-battle-overlay';overlay.hidden=true;
  const connector=svg('svg',{class:'strategy-battle-connector','aria-hidden':'true'});
  const card=el('section','strategy-battle-card');card.setAttribute('role','region');card.setAttribute('aria-label','継続会戦情報');
  overlay.append(connector,card);document.body.appendChild(overlay);
  const legend=el('div','strategy-map-legend');legend.innerHTML='<i class="strategic-blue"></i><i class="strategic-red"></i>濃色＝戦略支配　盾＝軍事支配　⚔＝継続会戦';
  document.body.appendChild(legend);
  let selected=null,raf=0,animationTimer=0,renderCount=0,routeRecords=[],geometryRecords=[],anchors=new Map(),lastContent='',cachedData=null,stateDirty=false,resizeDirty=false;
  function getData(){const s=window.__phase2UI?.getState?.(),c=window.__cityCommandUI?.getState?.(),P=window.PoliticalPhaseEngine,config=window.POLITICAL_PHASE_CONFIG;return s&&c&&P&&config?{s,c,P,config}:null;}
  function cityBox(id){try{const box=$(`unit-${id}`)?.getBBox();return box&&[box.x,box.y,box.width,box.height].every(Number.isFinite)?box:null;}catch(_){return null;}}
  function zoom(){return Math.max(1,Number(window.__strategyMapZoom?.factor)||1);}
  function cityName(c,id){return c.cities?.[id]?.city_name||id;}
  function ensureLayerOrder(){
    const flags=$('field-army-markers'),political=$('political-situation-window'),before=political||flags||null;
    map.insertBefore(routesLayer,before);map.insertBefore(controlLayer,before);
    const attack=map.querySelector('.enemy-attack-layer');if(attack)map.insertBefore(attack,before);
  }
  function queueRefresh(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(stateDirty){stateDirty=false;resizeDirty=false;refresh();}else if(cachedData){if(resizeDirty){resizeDirty=false;drawRoutes(cachedData);}positionLegend();if(selected)position(cachedData,cachedData.s.battles[selected]);}});}
  function schedule(){stateDirty=true;queueRefresh();}
  function scheduleLayout(resize=false){resizeDirty=resizeDirty||resize;queueRefresh();}
  function positionLegend(){const area=viewport();legend.hidden=area.width<80||area.height<80;Object.assign(legend.style,{left:`${area.x+8}px`,top:`${area.y+area.height-32}px`,maxWidth:`${Math.max(1,area.width-32)}px`});}
  function recolor(data,summary){
    const palette=window.CITY_COMMAND_CONFIG.seven_color_palette.map(x=>x.color),owners=new Map(summary.cities.map(x=>[x.city_id,x.owner]));
    for(const city of Object.values(data.c.cities)){
      const path=$(`unit-${city.city_id}`),display=$(`display-${city.city_id}`);if(!path||!display)continue;
      const owner=owners.get(city.city_id)||'UNCLAIMED',color=M.mapColor(Number(path.dataset.supportBand),owner,palette);
      display.style.setProperty('--support-color',color);display.style.fill=color;display.setAttribute('fill',color);
      display.dataset.strategicOwner=owner;path.style.setProperty('--support-color',color);
    }
  }
  function controlMarker(p,control,battle,name){
    const outer=svg('g',{transform:`translate(${p.x} ${p.y}) scale(${1/zoom()})`});
    if(control==='CONFLICT'){
      const clickable=Boolean(battle),g=svg('g',clickable?{'data-map-battle':battle.id,class:'strategy-battle-marker',tabindex:'0',role:'button','aria-label':`${name}の継続会戦情報`}:{});
      g.appendChild(svg('circle',{class:'battle-hit',r:'12'}));
      // Fixed-size swords; no additional flags are moved to the battle city.
      for(const sign of [-1,1]){
        const sword=svg('g',{transform:`rotate(${sign*43})`});
        sword.appendChild(svg('path',{d:'M -2 -9 L 0 -12 L 2 -9 L 2 4 L -2 4 Z',fill:'#f3eed9',stroke:'#151b24','stroke-width':'1.3'}));
        sword.appendChild(svg('path',{d:'M -5 4 L 5 4 M 0 4 L 0 10',stroke:'#e5bd54','stroke-width':'2.5','stroke-linecap':'round'}));g.appendChild(sword);
      }
      title(g,clickable?`${name}：継続会戦（クリックで情報）`:`${name}：交戦中`);outer.appendChild(g);
    }else if(M.FACTIONS.includes(control)){
      const d='M -8 -8 L 0 -11 L 8 -8 L 8 4 L 0 10 L -8 4 Z';
      for(const [stroke,width]of [['#081018',4],['#fff8e7',2.5]])outer.appendChild(svg('path',{d,fill:M.COLORS[control],stroke,'stroke-width':width}));
      title(outer,`${name}：${control==='PATRIOT'?'独立派':'王党派'}の軍事支配`);
    }
    return outer;
  }
  function drawRoutes(data){
    routesLayer.replaceChildren();routeRecords=M.collectRoutes(data.s);geometryRecords=[];
    const rect=map.getBoundingClientRect(),scale=Math.max(.01,rect.width/1448);
    routeRecords.forEach((route,index)=>{
      const a=anchors.get(route.origin),b=anchors.get(route.target),geo=M.routeGeometry(a,b,route,index,undefined,scale);if(!geo)return;
      geometryRecords.push({...route,geometry:geo});
      const g=svg('g',{'data-route-key':route.key,'data-route-battle':route.battle_id,opacity:selected?(route.battle_id===selected?1:.13):.65});
      const main=route.kind==='MAIN',dash=main?null:'7 5';
      for(const[color,width]of [['#07111b',main?8:7],['#fff9e9',main?6:5],[M.COLORS[route.faction],main?3:2]]){
        const attrs={d:geo.d,fill:'none',stroke:color,'stroke-width':width};if(dash)attrs['stroke-dasharray']=dash;g.appendChild(svg('path',attrs));
      }
      for(const[color,width]of [['#07111b',5],['#fff9e9',3],[M.COLORS[route.faction],0]])g.appendChild(svg('path',{d:geo.headD,fill:M.COLORS[route.faction],stroke:color,'stroke-width':width}));
      title(g,`${cityName(data.c,route.origin)} → ${cityName(data.c,route.target)}：${main?'主攻':'援軍'} ${route.army_ids.length}部隊`);routesLayer.appendChild(g);
    });
  }
  function flag(a,s){
    const c=s.commanders?.[a.commander_id],role=M.roleOrder(c),g=svg('svg',{class:`strategy-battle-flag ${a.faction==='PATRIOT'?'patriot':'british'} ${role===0?'commander-in-chief':role===1?'theater-commander':''}`,viewBox:'-12 -17 38 48',width:'22',height:'34','aria-label':`${c?.name||a.name}：${Number(a.manpower).toLocaleString()}名`});
    g.appendChild(svg('line',{class:'flag-pole',x1:0,y1:-3,x2:0,y2:27}));g.appendChild(svg('path',{class:'flag',d:'M1,-1 L21,3 L17,17 L1,13 Z'}));
    const mark=svg('text',{class:'flag-mark',x:10,y:11});mark.textContent=a.faction==='PATRIOT'?'A':'B';g.appendChild(mark);
    if(role<2)g.appendChild(svg('path',{class:role===0?'chief-star':'theater-star',d:M.STAR}));
    title(g,`${c?.name||a.name}：${Number(a.manpower).toLocaleString()}名`);return g;
  }
  function content(data,b){
    const forces=M.FACTIONS.map(f=>M.forces(data.s,b,f));
    const key=JSON.stringify([b.id,M.battleMonth(data.s,b),forces.map(f=>[f.manpower,f.garrison,f.armies.map(a=>[a.id,a.manpower,data.s.commanders?.[a.commander_id]?.role])])]);
    if(key===lastContent)return;lastContent=key;card.replaceChildren();
    const header=el('header'),h=el('h2',null,`${cityName(data.c,b.city_id)}会戦`),close=el('button','strategy-battle-close','×');h.id='strategy-battle-title';card.setAttribute('aria-labelledby',h.id);close.type='button';close.setAttribute('aria-label','会戦情報を閉じる');close.addEventListener('click',closeWindow);header.append(h,close);
    const month=el('div','strategy-battle-month',`継続戦闘 ${M.battleMonth(data.s,b)}ヶ月目`),host=el('div','strategy-battle-forces');
    for(const f of forces){
      const row=el('div','strategy-battle-force'),square=el('span',`strategy-faction-square ${f.faction==='PATRIOT'?'patriot':'british'}`),flags=el('div','strategy-battle-flags'),total=el('strong','strategy-battle-total',`${f.manpower.toLocaleString()}名`);
      row.dataset.faction=f.faction;square.setAttribute('aria-label',f.faction==='PATRIOT'?'独立派':'王党派');flags.append(...f.armies.map(a=>flag(a,data.s)));total.title=f.garrison?`守備隊 ${f.garrison.toLocaleString()}名を含む`:'参加部隊の合計兵数';row.append(square,flags,total);host.appendChild(row);
    }
    card.append(header,month,host);
  }
  function viewport(){const r=scroll.getBoundingClientRect();return{x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.max(0,Math.min(r.left+scroll.clientWidth,window.innerWidth)-Math.max(0,r.left)),height:Math.max(0,Math.min(r.top+scroll.clientHeight,window.innerHeight)-Math.max(0,r.top))};}
  function screenPoint(p,area){const r=map.getBoundingClientRect();return{x:r.left+p.x*r.width/1448-area.x,y:r.top+p.y*r.height/1086-area.y};}
  function position(data,b){
    const area=viewport();if(area.width<80||area.height<80){overlay.hidden=true;return;}
    overlay.hidden=false;Object.assign(overlay.style,{left:`${area.x}px`,top:`${area.y}px`,width:`${area.width}px`,height:`${area.height}px`});
    const width=Math.min(310,area.width-16);card.style.width=`${width}px`;card.style.maxHeight=`${area.height-16}px`;
    const obstacles=[];
    for(const city of Object.values(data.c.cities)){
      const r=$(`unit-${city.city_id}`)?.getBoundingClientRect();if(r)obstacles.push({x:r.left-area.x,y:r.top-area.y,width:r.width,height:r.height});
    }
    const political=$('political-situation-window')?.getBoundingClientRect();if(political)obstacles.push({x:political.left-area.x,y:political.top-area.y,width:political.width,height:political.height});
    const anchor=screenPoint(anchors.get(b.city_id),area),samples=geometryRecords.flatMap(r=>r.geometry.samples.map(p=>screenPoint(p,area))),size={width,height:Math.min(card.offsetHeight||152,area.height-16)},pos=M.placeWindow(area,size,anchor,obstacles,samples);
    card.style.left=`${pos.x}px`;card.style.top=`${pos.y}px`;
    const visible=anchor.x>=0&&anchor.y>=0&&anchor.x<=area.width&&anchor.y<=area.height;connector.replaceChildren();if(!visible)return;
    const end={x:Math.max(pos.x,Math.min(pos.x+pos.width,anchor.x)),y:Math.max(pos.y,Math.min(pos.y+pos.height,anchor.y))};
    if(anchor.x>=pos.x&&anchor.x<=pos.x+pos.width)end.y=anchor.y<pos.y?pos.y:pos.y+pos.height;
    const elbow={x:end.x,y:anchor.y},d=`M ${anchor.x} ${anchor.y} L ${elbow.x} ${elbow.y} L ${end.x} ${end.y}`,length=Math.abs(elbow.x-anchor.x)+Math.abs(end.y-elbow.y);
    for(const color of ['#07111b','#fff9e9']){const path=svg('path',{d,fill:'none',stroke:color,'stroke-width':color==='#07111b'?4:2,'stroke-dasharray':Math.max(1,length)});path.style.setProperty('--line-length',String(Math.max(1,length)));connector.appendChild(path);}
    card.style.transformOrigin=`${end.x-pos.x}px ${end.y-pos.y}px`;
  }
  function closeWindow(){
    const old=selected;selected=null;lastContent='';overlay.hidden=true;card.replaceChildren();connector.replaceChildren();clearTimeout(animationTimer);card.classList.remove('opening');connector.classList.remove('opening');schedule();
    if(old){const marker=controlLayer.querySelector(`[data-map-battle="${old}"]`);marker?.focus?.({preventScroll:true});}
  }
  function openWindow(id){
    const data=getData(),b=data?.s.battles?.[id];if(!b||!M.ongoing(b)||!cityBox(b.city_id))return false;
    const changed=selected!==id;selected=id;refresh();
    if(changed){clearTimeout(animationTimer);card.classList.remove('opening');connector.classList.remove('opening');void card.offsetWidth;card.classList.add('opening');connector.classList.add('opening');animationTimer=setTimeout(()=>{card.classList.remove('opening');connector.classList.remove('opening');},340);}
    return true;
  }
  function refresh(){
    const data=getData();if(!data)return;cachedData=data;renderCount++;ensureLayerOrder();
    positionLegend();
    const summary=data.P.strategicStars(data.c,data.s,data.config);recolor(data,summary);anchors=new Map();controlLayer.replaceChildren();
    const battles=new Map(Object.values(data.s.battles||{}).filter(M.ongoing).map(b=>[b.city_id,b]));
    const boxes=new Map(summary.cities.map(c=>[c.city_id,cityBox(c.city_id)]).filter(([,b])=>b)),counts=new Map();
    for(const army of Object.values(data.s.field_armies||{}))counts.set(army.location_city_id,(counts.get(army.location_city_id)||0)+1);
    const flags=[...boxes].flatMap(([id,b])=>M.armyFlagRects(b,counts.get(id)||0,zoom())),occupied=[];
    for(const city of summary.cities){const box=boxes.get(city.city_id);if(!box)continue;const neighbors=[...boxes].filter(([id,b])=>id!==city.city_id&&Math.hypot(b.x+b.width/2-box.x-box.width/2,b.y+b.height/2-box.y-box.height/2)<200).map(([,b])=>b),p=M.markerAnchor(box,counts.get(city.city_id)||0,zoom(),flags,neighbors,occupied);anchors.set(city.city_id,p);if(city.control!=='UNCONTROLLED'){controlLayer.appendChild(controlMarker(p,city.control,battles.get(city.city_id),cityName(data.c,city.city_id)));occupied.push({x:p.x-12/zoom(),y:p.y-12/zoom(),width:24/zoom(),height:24/zoom()});}}
    if(selected&&(!M.ongoing(data.s.battles?.[selected]||{})||!anchors.has(data.s.battles[selected].city_id))){selected=null;lastContent='';overlay.hidden=true;card.replaceChildren();connector.replaceChildren();}
    drawRoutes(data);
    if(selected){const b=data.s.battles[selected];content(data,b);position(data,b);}
  }
  function markerAction(event){const marker=event.target.closest?.('[data-map-battle]');if(!marker)return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();openWindow(marker.dataset.mapBattle);}
  controlLayer.addEventListener('click',markerAction);controlLayer.addEventListener('keydown',markerAction);
  card.addEventListener('click',event=>event.stopPropagation());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&selected){closeWindow();event.preventDefault();}});
  document.addEventListener('bts:strategy-state-changed',schedule);
  scroll.addEventListener('scroll',()=>scheduleLayout(),{passive:true});window.addEventListener('resize',()=>scheduleLayout(true),{passive:true});
  if(window.ResizeObserver){const observer=new ResizeObserver(()=>scheduleLayout(true));observer.observe(scroll);}
  window.__strategyBattleMap={refresh,schedule,open:openWindow,close:closeWindow,getSelected:()=>selected,getCityAnchor:id=>{const p=anchors.get(id);return p?{x:p.x,y:p.y}:null;},getRoutes:()=>routeRecords.map(r=>({...r,army_ids:[...r.army_ids]})),getDiagnostics:()=>({render_count:renderCount,route_count:geometryRecords.length,selected_battle:selected,open_windows:overlay.hidden?0:1})};
  refresh();
})();
