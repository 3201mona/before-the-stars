/*
 * BEFORE THE STARS — 局所軍旗配置の補正
 * β13 の5列配置および150%戦略地図を維持し、承認された4組の
 * 密集地域（重複する7都市）の軍旗グループだけを必要に応じて移動する。
 *
 * ゲーム状態、地図画像、都市パス、中心点、隣接関係は変更しない。
 * 部隊1本ずつではなく都市の軍旗グループを一括して動かす。
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BTSArmyMarkerOffsets=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TARGET_CITIES=Object.freeze([
    'RI_01','RI_02','MA_04','NJ_02','NJ_03','NJ_01','DE_02'
  ]);
  const APPROVED_PAIRS=Object.freeze([
    ['RI_01','RI_02'],
    ['MA_04','RI_01'],
    ['NJ_02','NJ_03'],
    ['NJ_01','DE_02']
  ]);
  const VIEWBOX={width:1448,height:1086};
  const MAX_SHIFT=55,STEP=5;
  const HITBOX={left:-12,top:-15,right:26,bottom:29};
  const candidates=[];
  for(let dx=-MAX_SHIFT;dx<=MAX_SHIFT;dx+=STEP){
    for(let dy=-MAX_SHIFT;dy<=MAX_SHIFT;dy+=STEP){
      candidates.push(Object.freeze({dx,dy,sq:dx*dx+dy*dy}));
    }
  }
  // 2都市比較画面が採用した列挙順。単独の承認済みペアは同じ解を返す。
  const previewCandidates=candidates.slice();
  candidates.sort((a,b)=>a.sq-b.sq||a.dy-b.dy||a.dx-b.dx);
  const ZERO=Object.freeze({dx:0,dy:0,sq:0});

  function groupRect(box,count,zoom=1.5){
    if(!box||!Number.isFinite(box.x)||!Number.isFinite(box.y)||
       !Number.isFinite(box.width)||!Number.isFinite(box.height)||
       !Number.isInteger(count)||count<1)return null;
    const factor=Math.max(1,Number(zoom)||1),cols=Math.min(5,count);
    const centerX=box.x+box.width/2,centerY=box.y+box.height/2;
    const points=[];
    for(let index=0;index<count;index++){
      const col=index%cols,row=Math.floor(index/cols);
      points.push({x:centerX-(cols-1)*15/2+col*15,
        y:centerY-12+row*24-(count>5?9:0)});
    }
    return {
      l:Math.min(...points.map(p=>p.x+HITBOX.left/factor)),
      t:Math.min(...points.map(p=>p.y+HITBOX.top/factor)),
      r:Math.max(...points.map(p=>p.x+HITBOX.right/factor)),
      b:Math.max(...points.map(p=>p.y+HITBOX.bottom/factor))
    };
  }
  function overlap(a,b,da=ZERO,db=ZERO){
    if(!a||!b)return 0;
    const w=Math.min(a.r+da.dx,b.r+db.dx)-Math.max(a.l+da.dx,b.l+db.dx);
    const h=Math.min(a.b+da.dy,b.b+db.dy)-Math.max(a.t+da.dy,b.t+db.dy);
    return w>0&&h>0?w*h:0;
  }
  function inMap(rect,delta){
    return rect.l+delta.dx>=0&&rect.t+delta.dy>=0&&
      rect.r+delta.dx<=VIEWBOX.width&&rect.b+delta.dy<=VIEWBOX.height;
  }
  function closeEnough(a,b){
    // 両者とも±55まで動ける場合を含む。遠く離れた都市は探索対象外。
    return !(a.r+2*MAX_SHIFT<b.l||b.r+2*MAX_SHIFT<a.l||
      a.b+2*MAX_SHIFT<b.t||b.b+2*MAX_SHIFT<a.t);
  }
  function totalCollision(entries,positions){
    let area=0,pairs=0;
    for(let i=0;i<entries.length;i++){
      const a=entries[i];
      for(let j=i+1;j<entries.length;j++){
        const b=entries[j];
        if(!closeEnough(a.rect,b.rect))continue;
        const part=overlap(a.rect,b.rect,positions[a.id]||ZERO,positions[b.id]||ZERO);
        if(part>0.00001){area+=part;pairs++;}
      }
    }
    return {area,pairs};
  }
  function score(entries,positions){
    const hits=totalCollision(entries,positions);
    let displacement=0,maxShift=0;
    for(const id of TARGET_CITIES){
      const d=positions[id]||ZERO;
      displacement+=d.dx*d.dx+d.dy*d.dy;
      maxShift=Math.max(maxShift,Math.hypot(d.dx,d.dy));
    }
    return {area:hits.area,pairs:hits.pairs,displacement,maxShift};
  }
  function better(a,b){
    return a.pairs<b.pairs||
      a.pairs===b.pairs&&(a.area<b.area-0.00001||
      Math.abs(a.area-b.area)<0.00001&&(a.displacement<b.displacement||
      a.displacement===b.displacement&&a.maxShift<b.maxShift));
  }
  function previewPairSolution(a,b){
    let bestScore=Infinity,best=null;
    for(const da of previewCandidates){
      if(!inMap(a.rect,da))continue;
      for(const db of previewCandidates){
        if(!inMap(b.rect,db))continue;
        const cost=overlap(a.rect,b.rect,da,db)*100000+da.sq+db.sq;
        if(cost<bestScore){bestScore=cost;best=[da,db];}
      }
    }
    return best?{
      [a.id]:{dx:best[0].dx,dy:best[0].dy},
      [b.id]:{dx:best[1].dx,dy:best[1].dy}
    }:{};
  }
  function calculateOffsets(groups,getBox,zoom=1.5){
    const entries=[];
    for(const [id,records] of Object.entries(groups||{})){
      const count=Array.isArray(records)?records.length:Number(records)||0;
      if(count<1)continue;
      const rect=groupRect(getBox(id),count,zoom);
      if(rect)entries.push({id,rect});
    }
    const hot=TARGET_CITIES.map(id=>entries.find(e=>e.id===id)).filter(Boolean);
    if(hot.length<1)return {};
    const neighbors=new Map(hot.map(entry=>[entry.id,entries.filter(other=>
      other.id!==entry.id&&closeEnough(entry.rect,other.rect))]));
    // 自都市に密集がなければ、正規β13の都市中心配置のままとする。
    if(!hot.some(entry=>neighbors.get(entry.id).some(other=>
      overlap(entry.rect,other.rect)>0)))return {};
    // 他都市の軍旗が近くにない承認済みの1ペアについては、ユーザーが
    // 実ブラウザで見て採用した比較版の「両都市を最小限ずつずらす」解に一致させる。
    if(hot.length===2&&APPROVED_PAIRS.some(pair=>
      pair.includes(hot[0].id)&&pair.includes(hot[1].id))&&
      neighbors.get(hot[0].id).length===1&&neighbors.get(hot[1].id).length===1){
      return previewPairSolution(hot[0],hot[1]);
    }
    const orderByContacts=[...hot].sort((a,b)=>{
      const weight=e=>neighbors.get(e.id).reduce((s,other)=>
        s+overlap(e.rect,other.rect),0);
      return weight(b)-weight(a)||TARGET_CITIES.indexOf(a.id)-TARGET_CITIES.indexOf(b.id);
    }).map(e=>e.id);
    const orders=[orderByContacts,[...orderByContacts].reverse(),
      TARGET_CITIES.filter(id=>hot.some(h=>h.id===id))];
    let bestPositions=null,bestScore=null;
    for(const order of orders){
      const positions=Object.fromEntries(hot.map(e=>[e.id,ZERO]));
      for(let sweep=0;sweep<9;sweep++){
        let changed=false;
        for(const id of order){
          const city=hot.find(e=>e.id===id);
          const nearby=neighbors.get(id),before=positions[id];
          let best=before,bestCost=Infinity;
          for(const candidate of candidates){
            if(!inMap(city.rect,candidate))continue;
            let collisions=0;
            for(const other of nearby){
              collisions+=overlap(city.rect,other.rect,candidate,positions[other.id]||ZERO);
            }
            // 1平方単位の重複は、数十単位の移動よりも優先して解消する。
            const cost=collisions*100000+candidate.sq;
            if(cost<bestCost-0.00001){
              bestCost=cost;best=candidate;
            }
          }
          if(best!==before){positions[id]=best;changed=true;}
        }
        if(!changed)break;
      }
      const result=score(entries,positions);
      if(!bestScore||better(result,bestScore)){
        bestScore=result;bestPositions=positions;
      }
    }
    const result={};
    for(const [id,shift] of Object.entries(bestPositions||{})){
      if(shift.dx||shift.dy)result[id]={dx:shift.dx,dy:shift.dy};
    }
    return result;
  }
  return {TARGET_CITIES,APPROVED_PAIRS,groupRect,overlap,
    calculateOffsets,totalCollision,VIEWBOX};
});
