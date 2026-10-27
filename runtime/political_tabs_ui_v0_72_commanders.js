(function(){
  'use strict';
  const $=id=>document.getElementById(id),C=window.POLITICAL_PHASE_CONFIG,P=window.PoliticalPhaseEngine;
  if(!C||!P||!window.__politicalPhaseUI)return;
  let activeCategory='BUDGET',allowDirect=false,currentProposal=null;
  const style=document.createElement('style');
  style.textContent=`
    .pv2 .political-side-note{margin-top:auto;color:#cbd5d2;font-size:12.5px;line-height:1.45;padding:5px 1px}.pv2 .proposal-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 9px}.pv2 .proposal-tabs button{margin:0;padding:10px 8px;font-size:15px;font-weight:900}.pv2 .proposal-tabs button.active{border-color:#ffd766;background:#4a3b16;color:#fff0ad;box-shadow:inset 0 -3px #c9a42e}.pv2 .proposal-list{grid-template-columns:repeat(2,minmax(0,1fr))}.pv2 .proposal-row[hidden]{display:none!important}.pv2 .political-result[hidden]{display:none!important}
    #proposal-detail-modal{position:fixed;inset:0;z-index:210;background:#000c;display:grid;place-items:center;padding:18px}#proposal-detail-modal[hidden]{display:none!important}.proposal-detail-card{width:min(560px,95vw);border:4px double #d0a330;background:linear-gradient(180deg,#29383d,#111b21);box-shadow:0 18px 60px #000;color:#f6efdb;padding:18px}.proposal-detail-card h3{margin:0;color:#ffd766;font-size:23px;border-bottom:2px solid #8f773b;padding-bottom:8px}.proposal-detail-effect{margin:12px 0;padding:10px 12px;background:#13242c;border:1px solid #566b76;font-size:16px;line-height:1.5}.proposal-detail-meta{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:9px 0}.proposal-detail-meta div{background:#0e1a20;border:1px solid #465b64;padding:8px}.proposal-target{display:block;margin:12px 0;color:#d8e0de}.proposal-target select{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:9px;background:#0d1a21;border:1px solid #607b85;color:#fff;font-size:15px}.proposal-detail-warning{min-height:20px;color:#ff987d;font-size:13px}.proposal-support-preview{margin:9px 0;padding:10px 12px;border:1px solid #566b76;background:#0e1a20;font-size:14px;line-height:1.55}.proposal-support-preview[hidden]{display:none!important}.proposal-support-preview .preview-row{display:grid;grid-template-columns:110px 1fr;gap:8px;padding:3px 0}.proposal-support-preview .positive{color:#6ebeff}.proposal-support-preview .negative{color:#ff876d}.foreign-progress-panel{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:-2px 0 1px}.foreign-progress-row{display:grid;gap:6px;padding:9px 11px;border:1px solid #566b76;background:#0e1a20;min-width:0}.foreign-proposal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}.foreign-proposal-name{font-size:17px;font-weight:900;color:#fff1b7;line-height:1.22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.foreign-negotiation-state{flex:0 0 auto;font-size:14px;font-weight:900;white-space:nowrap}.foreign-negotiation-state.patriot-secret{color:#8ed8ff}.foreign-negotiation-state.patriot-sustained{color:#4b8fff}.foreign-negotiation-state.patriot-full{color:#2d5fd2;text-shadow:0 0 5px #2d5fd255}.foreign-negotiation-state.british-secret{color:#ff9e8a}.foreign-negotiation-state.british-sustained{color:#ff665a}.foreign-negotiation-state.british-full{color:#d93636;text-shadow:0 0 5px #d9363655}.foreign-progress-line{display:grid;grid-template-columns:72px minmax(120px,1fr) 66px 66px;gap:7px;align-items:center}.foreign-country{font-size:16px;font-weight:900;color:#f4e7bd;white-space:nowrap}.foreign-stage{font-size:14px;color:#cbd5d2;text-align:center;white-space:nowrap}.foreign-bar{height:12px;border:1px solid #60727a;background:#1a282e;overflow:hidden;min-width:120px}.foreign-bar>span{display:block;height:100%;background:#b99b4a}.foreign-meta{font-size:14px;color:#d8dfdb;line-height:1.3;white-space:nowrap}.foreign-proposal-button{font-size:14px;font-weight:900;padding:7px 9px;border:2px solid #8f773b;background:#24343a;color:#ffe59a}.foreign-proposal-button:disabled{opacity:.45;color:#aeb6b5;border-color:#56656b;background:#182329}@media(max-width:860px){.foreign-progress-panel{grid-template-columns:1fr}.foreign-progress-line{grid-template-columns:72px minmax(120px,1fr) 66px 66px}}.pv2.foreign-category-active .proposal-list{display:none!important}.proposal-detail-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.proposal-detail-actions button{font-size:16px;font-weight:900;padding:8px 17px}
    @media(max-width:620px){.pv2 .proposal-tabs{grid-template-columns:1fr 1fr}.pv2 .proposal-list{grid-template-columns:1fr}.proposal-detail-meta{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
  const reference=window.BTSPoliticalReferenceModel;
  if(!reference)throw new Error('POLITICAL_REFERENCE_MODEL_MISSING');
  const referenceStyle=document.createElement('style');
  referenceStyle.textContent=`
    .pv2 .pv-reference-panel{min-width:0;align-self:stretch;padding:12px 15px;border:1px solid #637781;border-left:3px solid #c3a257;background:linear-gradient(120deg,#172830,#0e1a21);color:#e5ece7}
    .pv2 .pv-reference-heading{font-size:14px;font-weight:900;color:#e8d38d;letter-spacing:.04em;margin-bottom:7px}
    .pv2 .pv-reference-value{font-size:29px;line-height:1.25;font-weight:900;color:#f9e8a8;font-variant-numeric:tabular-nums}
    .pv2 .pv-reference-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid #334a53;padding:4px 0;font-size:13px}
    .pv2 .pv-reference-row strong{color:#f9e8b8;white-space:nowrap;font-variant-numeric:tabular-nums}
    .pv2 .pv-reference-note{margin:8px 0 0;font-size:12px;line-height:1.5;color:#b7c7c8}
    .pv2 .pv-reference-action{width:100%;padding:9px 12px;margin:8px 0 0;border:1px solid #b99c55;color:#fff1bf;background:#2b4048;font-size:15px;font-weight:900}
    .pv2 .pv-reference-breakdown{margin-top:8px;font-size:12px;color:#d4e1e0}
    .pv2 .pv-reference-breakdown summary{cursor:pointer;color:#f2d890;font-weight:800}
    .pv2 .pv-reference-breakdown .pv-reference-row{font-size:12px;align-items:start}
    .pv2 .pv-reference-breakdown .pv-reference-row span{min-width:0}
    #pv-commander-roster{position:fixed;inset:0;z-index:205;background:#000d;display:grid;place-items:center;padding:16px}
    #pv-commander-roster[hidden]{display:none!important}
    .pv-roster-card{width:min(760px,96vw);max-height:90vh;overflow:auto;border:4px double #c7a352;background:linear-gradient(180deg,#26383d,#111e24);color:#f0ede1;padding:16px 19px;box-shadow:0 20px 60px #000}
    .pv-roster-head{display:flex;align-items:start;justify-content:space-between;gap:12px;border-bottom:2px solid #8f773b;padding-bottom:10px}
    .pv-roster-head h3{margin:0;color:#ffe097;font-size:23px}
    .pv-roster-head p{font-size:13px;color:#b9cbd0;margin:3px 0 0}
    .pv-roster-head button{padding:7px 15px;font-weight:900}
    .pv-roster-list{display:grid;gap:5px;margin-top:13px}
    .pv-roster-entry{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:center;min-width:0;width:100%;text-align:left;padding:10px 12px;background:#17272e;border:1px solid #506770;color:#edf2ea}
    .pv-roster-entry:hover,.pv-roster-entry:focus-visible{background:#29424d;border-color:#c7a352}
    .pv-roster-name{display:block;font-size:16px;font-weight:900;color:#fff0b6}
    .pv-roster-detail{display:block;font-size:12px;color:#b9cbd0;margin-top:3px}
    .pv-roster-state{display:block;font-size:12px;color:#d8c493;margin-bottom:2px}
    .pv-roster-place{display:block;font-size:15px;font-weight:800}
    .pv-roster-status{display:block;font-size:12px;color:#b9cbd0;margin-top:3px}
    @media(max-width:620px){.pv-roster-card{padding:12px}.pv-roster-entry{grid-template-columns:1fr;gap:5px}.pv-roster-head h3{font-size:19px}}
  `;
  document.head.appendChild(referenceStyle);
  const roster=document.createElement('div');roster.id='pv-commander-roster';roster.hidden=true;
  roster.innerHTML='<section class="pv-roster-card" role="dialog" aria-modal="true" aria-labelledby="pv-roster-title"><div class="pv-roster-head"><div><h3 id="pv-roster-title">配備済み将軍一覧</h3><p>将軍を選ぶと部隊詳細を閲覧できます。政治フェーズ中の命令は実行できません。</p></div><button id="pv-roster-close" type="button">閉じる</button></div><div id="pv-roster-list" class="pv-roster-list"></div></section>';
  document.body.appendChild(roster);
  function closeRoster(){roster.hidden=true;}
  $('pv-roster-close').addEventListener('click',closeRoster);
  roster.addEventListener('click',event=>{if(event.target===roster)closeRoster();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!roster.hidden)closeRoster();});
  const detail=document.createElement('div');detail.id='proposal-detail-modal';detail.hidden=true;detail.innerHTML='<section class="proposal-detail-card"><h3 id="proposal-detail-title"></h3><div id="proposal-detail-effect" class="proposal-detail-effect"></div><div class="proposal-detail-meta"><div>必要州票 <strong id="proposal-detail-votes"></strong></div><div>可決見込み <strong id="proposal-detail-chance"></strong></div></div><label id="proposal-target-row" class="proposal-target">対象を選択<select id="proposal-target-select"></select></label><div id="proposal-support-preview" class="proposal-support-preview" hidden></div><div id="proposal-detail-warning" class="proposal-detail-warning"></div><div class="proposal-detail-actions"><button id="proposal-detail-submit">議案を提出</button><button id="proposal-detail-cancel">取消</button></div></section>';
  document.body.appendChild(detail);
  function faction(){return window.__phase2UI.getState().current_faction||'PATRIOT';}
  function targetOptions(proposal){const military=window.__phase2UI.getState(),cities=window.__cityCommandUI.getState(),side=faction();
    if(proposal.effect_type==='DOMESTIC_SUPPLY_SUPPORT')return Object.values(cities.cities).filter(city=>P.militaryControl(military,city.city_id,C)===side).map(city=>{const troops=Object.values(military.field_armies||{}).filter(army=>army.faction===side&&army.location_city_id===city.city_id&&Number(army.manpower)>0).reduce((n,army)=>n+Number(army.manpower||0),0);return{value:city.city_id,label:`${city.city_name}　食${city.stockpile.FOOD}/${city.capacity.FOOD}　物${city.stockpile.MATERIALS}/${city.capacity.MATERIALS}　軍${troops.toLocaleString()}名`};});
    if(proposal.effect_type==='THEATER_APPOINTMENT')return Object.values(military.commanders).filter(item=>item.faction===side&&item.role==='通常指揮官').map(item=>({value:item.id,label:`${item.name}（少将）`}));
            return[];
  }
  function needsTarget(proposal){return['DOMESTIC_SUPPLY_SUPPORT','THEATER_APPOINTMENT'].includes(proposal.effect_type);}

  function updateSupportPreview(proposal){const box=$('proposal-support-preview');if(!box)return;if(!proposal||proposal.effect_type!=='DOMESTIC_SUPPLY_SUPPORT'){box.hidden=true;box.innerHTML='';return;}const cities=window.__cityCommandUI.getState(),military=window.__phase2UI.getState(),city=cities.cities[$('proposal-target-select').value];if(!city){box.hidden=true;return;}const side=faction(),troops=Object.values(military.field_armies||{}).filter(army=>army.faction===side&&army.location_city_id===city.city_id&&Number(army.manpower)>0).reduce((n,army)=>n+Number(army.manpower||0),0),foodAdd=Number(proposal.food_amount)||0,matAdd=Number(proposal.materials_amount)||0,foodAfter=Math.min(city.capacity.FOOD,city.stockpile.FOOD+foodAdd),matAfter=Math.min(city.capacity.MATERIALS,city.stockpile.MATERIALS+matAdd),foodWaste=Math.max(0,city.stockpile.FOOD+foodAdd-city.capacity.FOOD),matWaste=Math.max(0,city.stockpile.MATERIALS+matAdd-city.capacity.MATERIALS);box.hidden=false;box.innerHTML=`<div class="preview-row"><span>駐屯野戦軍</span><strong>${troops.toLocaleString()}名</strong></div><div class="preview-row"><span>食糧備蓄</span><strong>${city.stockpile.FOOD} / ${city.capacity.FOOD} → <span class="positive">${foodAfter} / ${city.capacity.FOOD}</span>${foodWaste?` <span class="negative">（${foodWaste}廃棄）</span>`:''}</strong></div><div class="preview-row"><span>物資備蓄</span><strong>${city.stockpile.MATERIALS} / ${city.capacity.MATERIALS} → <span class="positive">${matAfter} / ${city.capacity.MATERIALS}</span>${matWaste?` <span class="negative">（${matWaste}廃棄）</span>`:''}</strong></div>`;}
  function foreignStage(value){const v=Math.max(0,Math.min(100,Number(value)||0)),thresholds=C.foreign_aid?.thresholds||[];return thresholds.find(x=>v>=x.min&&v<=x.max)||thresholds[0]||{id:'WATCHING',label:'静観',min:0,max:24};}
  function foreignNext(value){const v=Math.max(0,Math.min(100,Number(value)||0)),stages=C.foreign_aid?.thresholds||[],next=stages.find(x=>x.min>v);return next?`${next.label}まであと${next.min-v}`:'本格介入'}
  function foreignNegotiationState(side,id,value){
    const v=Math.max(0,Math.min(100,Number(value)||0));
    if(side==='PATRIOT'){
      if(v<25)return {text:'秘密援助交渉中',className:'patriot-secret'};
      if(v<50)return {text:'継続援助交渉中',className:'patriot-sustained'};
      if(v<75)return {text:(id==='FRANCE'||id==='SPAIN')?'参戦交渉中':'本格援助交渉中',className:'patriot-full'};
      return {text:(id==='FRANCE'||id==='SPAIN')?'参戦実現':'本格援助実現',className:'patriot-full'};
    }
    if(v<50)return {text:'秘密援助阻止工作中',className:'british-secret'};
    if(v<75)return {text:'継続援助阻止工作中',className:'british-sustained'};
    return {text:(id==='FRANCE'||id==='SPAIN')?'参戦阻止交渉中':'本格援助阻止工作中',className:'british-full'};
  }
  function germanNegotiationState(value){
    const v=Math.max(0,Math.min(100,Number(value)||0));
    if(v<25)return {text:'秘密派遣交渉中',className:'british-secret'};
    if(v<50)return {text:'継続派遣交渉中',className:'british-sustained'};
    if(v<75)return {text:'本格派遣交渉中',className:'british-full'};
    return {text:'本格派遣実現',className:'british-full'};
  }
  function renderForeignProgress(){let panel=document.getElementById('pv-foreign-progress');const host=$('pv-proposals');if(!host)return;if(!panel){panel=document.createElement('div');panel.id='pv-foreign-progress';panel.className='foreign-progress-panel';host.parentNode.insertBefore(panel,host);}const military=window.__phase2UI.getState(),side=faction(),patMap=military.political_phase?.foreign_intervention?.PATRIOT||{},germanValue=Math.max(0,Math.min(100,Number(military.political_phase?.german_auxiliaries?.BRITISH)||0)),votes=P.voteTally(window.__cityCommandUI.getState(),C)[side],summary=P.indicatorSummary(military,side,C),order=['NETHERLANDS','SPAIN','FRANCE'];panel.hidden=activeCategory!=='FOREIGN';document.querySelector('.pv2')?.classList.toggle('foreign-category-active',!panel.hidden);if(panel.hidden)return;const cards=order.map(id=>{const value=Math.max(0,Math.min(100,Number(patMap[id])||0)),stage=foreignStage(value),label=C.foreign_aid?.countries?.[id]?.label||id,proposal=C.proposals[side].find(item=>item.category==='FOREIGN'&&item.country===id),chance=proposal?P.approvalChance(proposal,summary.trust_level,C):0,original=proposal?host.querySelector(`[data-proposal="${proposal.id}"]`):null,disabled=!proposal||Boolean(original?.disabled),negotiation=foreignNegotiationState(side,id,value);return `<div class="foreign-progress-row"><div class="foreign-proposal-head"><div class="foreign-proposal-name">${proposal?.name||'交渉議案なし'}</div><div class="foreign-negotiation-state ${negotiation.className}">${negotiation.text}</div></div><div class="foreign-progress-line"><span class="foreign-country">${label}</span><span class="foreign-bar" aria-label="${label} 交渉進展"><span style="width:${value}%"></span></span><span class="foreign-stage">${stage.label}</span><button type="button" class="foreign-proposal-button" data-foreign-proposal="${proposal?.id||''}" ${disabled?'disabled':''}>選択</button></div><div class="foreign-meta">必要票 ${proposal?.required_votes??'-'}／保有票 ${votes}　可決見込み ${chance}％</div></div>`;});if(side==='BRITISH'){const proposal=C.proposals.BRITISH.find(item=>item.id==='BRI_GERMAN_AUXILIARIES'),stage=P.germanAuxiliaryStage?P.germanAuxiliaryStage(germanValue,C):foreignStage(germanValue),chance=proposal?P.approvalChance(proposal,summary.trust_level,C):0,original=proposal?host.querySelector(`[data-proposal="${proposal.id}"]`):null,disabled=!proposal||Boolean(original?.disabled),negotiation=germanNegotiationState(germanValue);cards.push(`<div class="foreign-progress-row"><div class="foreign-proposal-head"><div class="foreign-proposal-name">${proposal?.name||'ドイツ諸侯傭兵交渉'}</div><div class="foreign-negotiation-state ${negotiation.className}">${negotiation.text}</div></div><div class="foreign-progress-line"><span class="foreign-country">ドイツ諸侯</span><span class="foreign-bar" aria-label="ドイツ諸侯 交渉進展"><span style="width:${germanValue}%"></span></span><span class="foreign-stage">${stage.label}</span><button type="button" class="foreign-proposal-button" data-foreign-proposal="${proposal?.id||''}" ${disabled?'disabled':''}>選択</button></div><div class="foreign-meta">必要票 ${proposal?.required_votes??'-'}／保有票 ${votes}　可決見込み ${chance}％</div></div>`);}panel.innerHTML=cards.join('');panel.querySelectorAll('[data-foreign-proposal]').forEach(button=>button.addEventListener('click',()=>{const proposal=C.proposals[side].find(item=>item.id===button.dataset.foreignProposal);if(proposal)openDetail(proposal);}));}

  function proposalEffectMarkup(proposal,military,side){
    if(proposal.effect_type!=='BUDGET_REQUEST')return proposal.effect_note||'議案効果を適用します。';
    const before=Math.max(0,Number(military.factions?.[side]?.treasury)||0),gain=Math.max(0,Number(proposal.military_funds_grant)||0),after=before+gain;
    return `<div>${proposal.effect_note||'軍資金を追加します。'}</div><div class="preview-row"><span>現在の軍資金</span><strong>${before.toLocaleString()}</strong></div><div class="preview-row"><span>可決後の軍資金</span><strong>${before.toLocaleString()} → ${after.toLocaleString()} <span class="positive">（+${gain.toLocaleString()}）</span></strong></div>`;
  }
  function openDetail(proposal){const military=window.__phase2UI.getState(),side=faction(),summary=P.indicatorSummary(military,side,C),votes=P.voteTally(window.__cityCommandUI.getState(),C)[side],options=targetOptions(proposal),targeted=needsTarget(proposal);currentProposal=proposal;$('proposal-detail-title').textContent=proposal.name;$('proposal-detail-effect').innerHTML=proposalEffectMarkup(proposal,military,side);$('proposal-detail-votes').textContent=`${proposal.required_votes}票（保有 ${votes}票）`;$('proposal-detail-chance').textContent=`${P.approvalChance(proposal,summary.trust_level,C)}％`;$('proposal-target-row').hidden=!targeted;const select=$('proposal-target-select');select.replaceChildren(...options.map(item=>{const option=document.createElement('option');option.value=item.value;option.textContent=item.label;return option;}));if(targeted&&options.length)$('proposal-target-select').value=options[0].value;updateSupportPreview(proposal);const noCandidate=targeted&&!options.length,dispatchEmpty=proposal.effect_type==='GENERAL_DISPATCH'&&!(military.political_phase?.dispatch_candidates?.[side]||[]).length,warning=$('proposal-detail-warning');warning.textContent=dispatchEmpty?'派遣可能な将軍が登録されていません。':proposal.effect_type==='THEATER_APPOINTMENT'&&Object.values(military.commanders).filter(item=>item.faction===side&&item.role==='方面軍司令官').length>=3?'方面軍司令官は上限3名です。':noCandidate?'選択できる対象がありません。':'';$('proposal-detail-submit').disabled=Boolean(warning.textContent);detail.hidden=false;}
  function closeDetail(){detail.hidden=true;currentProposal=null;window.__pendingPoliticalProposalTarget=null;}
  $('proposal-target-select').addEventListener('change',()=>updateSupportPreview(currentProposal));$('proposal-detail-cancel').addEventListener('click',closeDetail);detail.addEventListener('click',event=>{if(event.target===detail)closeDetail();});
  $('proposal-detail-submit').addEventListener('click',()=>{if(!currentProposal)return;const button=document.querySelector(`#pv-proposals [data-proposal="${currentProposal.id}"]`);if(!button||button.disabled)return;window.__pendingPoliticalProposalTarget=needsTarget(currentProposal)?$('proposal-target-select').value:null;allowDirect=true;detail.hidden=true;button.click();allowDirect=false;currentProposal=null;});
  document.addEventListener('click',event=>{const button=event.target.closest?.('#pv-proposals [data-proposal]');if(!button||allowDirect)return;event.preventDefault();event.stopImmediatePropagation();const proposal=C.proposals[faction()].find(item=>item.id===button.dataset.proposal);if(proposal)openDetail(proposal);},true);
  function referenceText(parent,text,className){const el=document.createElement('div');if(className)el.className=className;el.textContent=text;parent.appendChild(el);return el;}
  function referenceRow(parent,label,value){const row=document.createElement('div');row.className='pv-reference-row';const name=document.createElement('span'),number=document.createElement('strong');name.textContent=label;number.textContent=value;row.append(name,number);parent.appendChild(row);return row;}
  function openCommanderRoster(){
    const military=window.__phase2UI.getState();
    if(military.runtime_flow_phase!=='POLITICAL'||$('political-phase-modal')?.hidden)return;
    const entries=reference.deployedCommanders(military,window.__cityCommandUI.getState(),faction(),window.BattleArmyMarkerModel),list=$('pv-roster-list');
    $('pv-roster-title').textContent=`${faction()==='PATRIOT'?'独立派':'王党派'}・配備済み将軍 ${entries.length}名`;
    list.replaceChildren();
    if(!entries.length)referenceText(list,'現在、配備済みの将軍はいません。','pv-reference-note');
    for(const item of entries){
      const button=document.createElement('button');button.type='button';button.className='pv-roster-entry';
      const left=document.createElement('span'),right=document.createElement('span');
      referenceText(left,`${item.name}　${item.rank}`,'pv-roster-name');
      referenceText(left,`${item.role} ／ ${item.armyName}`,'pv-roster-detail');
      referenceText(right,item.stateName,'pv-roster-state');
      referenceText(right,item.cityName,'pv-roster-place');
      referenceText(right,`${item.locationNote} ／ ${item.manpower.toLocaleString()}名`,'pv-roster-status');
      button.append(left,right);
      button.addEventListener('click',()=>{
        if(window.__phase2UI.getState().runtime_flow_phase!=='POLITICAL')return;
        closeRoster();window.__phase2UI.openArmy(item.armyId);
      });
      list.appendChild(button);
    }
    roster.hidden=false;
  }
  function renderReferencePanel(host,military,side){
    host.querySelector('#pv-reference-panel')?.remove();
    if(!['BUDGET','SUPPLY','PERSONNEL'].includes(activeCategory))return;
    const panel=document.createElement('aside');panel.id='pv-reference-panel';panel.className='pv-reference-panel';
    if(activeCategory==='BUDGET'){
      referenceText(panel,'現在の軍資金','pv-reference-heading');
      referenceText(panel,(Number(military.factions?.[side]?.treasury)||0).toLocaleString(),'pv-reference-value');
      referenceText(panel,'軍資金は議決により国庫・軍事予算から拠出され、指令フェーズで使用できる資金となります。','pv-reference-note');
    }else if(activeCategory==='SUPPLY'){
      const plan=reference.supplyPlan(military,window.__cityCommandUI.getState(),side,C,P);
      referenceText(panel,'議会閉会時の補給予定','pv-reference-heading');
      referenceRow(panel,'食糧',plan.totals.food.toLocaleString());
      referenceRow(panel,'軍需物資',plan.totals.materials.toLocaleString());
      if(plan.records.length){
        const details=document.createElement('details');details.className='pv-reference-breakdown';details.open=plan.records.length<=4;
        const summary=document.createElement('summary');summary.textContent=`補給元の内訳（${plan.records.length}件）`;
        details.appendChild(summary);
        for(const item of plan.records)referenceRow(details,item.source,`食 ${item.food.toLocaleString()} ／ 物 ${item.materials.toLocaleString()}`);
        panel.appendChild(details);
      }else referenceText(panel,'現在、発送・直接支援の予定はありません。','pv-reference-note');
      referenceText(panel,'表示は予定量です。制海権・港湾事情で到着量は減少します。また都市の備蓄上限を超える分は廃棄されます。','pv-reference-note');
    }else{
      const entries=reference.deployedCommanders(military,window.__cityCommandUI.getState(),side,window.BattleArmyMarkerModel),theater=reference.theaterCommanderCount(military,side);
      referenceText(panel,'将軍・配備状況','pv-reference-heading');
      referenceRow(panel,'配備済み',`${entries.length}名`);
      referenceRow(panel,'方面軍司令官',`${theater} / 3名`);
      const button=document.createElement('button');button.type='button';button.className='pv-reference-action';button.textContent='配備済み将軍一覧を見る';button.addEventListener('click',openCommanderRoster);panel.appendChild(button);
      referenceText(panel,'階級・所在都市・兵数を確認できます。将軍詳細は閲覧専用です。','pv-reference-note');
    }
    host.appendChild(panel);
  }
  function refresh(){const tabs=$('pv-category-tabs'),host=$('pv-proposals');if(!tabs||!host)return;const military=window.__phase2UI.getState(),side=faction(),reserveCount=military.political_phase?.commander_reserves?.[side]?.length||0;tabs.replaceChildren(...C.proposal_categories.map(category=>{const button=document.createElement('button');button.type='button';button.className=category.id===activeCategory?'active':'';button.textContent=category.id==='PERSONNEL'?`${category.label}（予備役${reserveCount}名）`:category.label;button.addEventListener('click',()=>{activeCategory=category.id;refresh();});return button;}));for(const row of host.querySelectorAll('.proposal-row'))row.hidden=!row.classList.contains(`proposal-category-${activeCategory}`);renderReferencePanel(host,military,side);renderForeignProgress();}
  window.__politicalTabsUI={refresh,openDetail};refresh();
})();
