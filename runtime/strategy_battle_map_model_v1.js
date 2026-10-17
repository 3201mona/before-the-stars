(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StrategyBattleMapModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FACTIONS=['PATRIOT','BRITISH'];
  const COLORS={PATRIOT:'#2768ff',BRITISH:'#f23943'};
  const STAR='M0,-13 3,-6 11,-6 5,-1 7,7 0,2 -7,7 -5,-1 -11,-6 -3,-6Z';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const alive=(s,id)=>s.field_armies?.[id]&&Number(s.field_armies[id].manpower)>0;
  const ongoing=b=>['active','awaiting_continuation'].includes(b.status)&&(b.history||[]).length>0;
  function mapColor(band,owner,palette){
    if(owner==='PATRIOT')return palette[0];
    if(owner==='BRITISH')return palette[6];
    return palette[clamp(Number(band)||0,1,5)];
  }
  function roleOrder(c){return c?.role==='総司令官'?0:c?.role==='方面軍司令官'?1:2;}
  function battleMonth(s,b){
    const match=String(b.started_month||'').match(/^(\d{4})-(\d{1,2})$/);
    if(match&&s.calendar){const elapsed=(Number(s.calendar.year)-Number(match[1]))*12+Number(s.calendar.month)-Number(match[2]);if(Number.isFinite(elapsed))return Math.max(1,elapsed+1);}
    return Math.max(1,(Number(b.continued_months)||0)+1);
  }
  function forces(s,b,faction){
    const ids=faction===b.attacker_faction?b.attacker_army_ids:b.defender_army_ids;
    const armies=[...new Set(ids||[])].filter(id=>alive(s,id)&&s.field_armies[id].faction===faction).map(id=>s.field_armies[id]);
    armies.sort((a,z)=>roleOrder(s.commanders?.[a.commander_id])-roleOrder(s.commanders?.[z.commander_id])||String(a.id).localeCompare(String(z.id)));
    const g=s.garrisons?.[b.city_id]||Object.values(s.garrisons||{}).find(g=>g.id===b.garrison_id);
    const garrison=faction===b.defender_faction&&g?.faction===faction?Math.max(0,Number(g.manpower)||0):0;
    return {faction,armies,garrison,manpower:armies.reduce((n,a)=>n+Math.max(0,Number(a.manpower)||0),0)+garrison};
  }
  function collectRoutes(s){
    const routes=[];
    for(const b of Object.values(s.battles||{}).filter(ongoing).sort((a,z)=>String(a.id).localeCompare(String(z.id)))){
      const meta=b.reinforcement_origins||{};
      const original=[...new Set(b.attacker_army_ids||[])].filter(id=>alive(s,id)&&!meta[id]);
      if(b.origin_city_id&&b.origin_city_id!==b.city_id&&original.length)routes.push({key:JSON.stringify([b.id,'MAIN',b.origin_city_id]),battle_id:b.id,origin:b.origin_city_id,target:b.city_id,faction:b.attacker_faction,kind:'MAIN',mode:b.route_type==='LANDING_ATTACK'?'SEA':'LAND',army_ids:original});
      const groups=new Map();
      for(const [id,o] of Object.entries(meta)){
        if(!alive(s,id)||s.field_armies[id].battle_id!==b.id||!o.origin_city_id||o.origin_city_id===b.city_id)continue;
        const a=s.field_armies[id],participantIds=a.faction===b.attacker_faction?b.attacker_army_ids:b.defender_army_ids;
        if(!(participantIds||[]).includes(id))continue;
        const mode=o.route_mode==='SEA'?'SEA':'LAND',key=JSON.stringify([b.id,'REINFORCEMENT',o.origin_city_id,a.faction,mode]);
        if(!groups.has(key))groups.set(key,{key,battle_id:b.id,origin:o.origin_city_id,target:b.city_id,faction:a.faction,kind:'REINFORCEMENT',mode,army_ids:[]});
        groups.get(key).army_ids.push(id);
      }
      routes.push(...groups.values());
    }
    return routes.sort((a,b)=>a.key.localeCompare(b.key));
  }
  function point(x,y){return{x,y};}
  function routeGeometry(a,b,route,index=0,bounds={x:0,y:0,width:1448,height:1086},scale=1){
    if(!a||!b||![a.x,a.y,b.x,b.y].every(Number.isFinite))return null;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d<.01)return null;
    scale=Math.max(.01,Number(scale)||1);
    const unit=point(dx/d,dy/d),normal=point(-unit.y,unit.x),startInset=Math.min(9/scale,d*.18),endInset=Math.min(12/scale,d*.22);
    const p0=point(a.x+unit.x*startInset,a.y+unit.y*startInset),p3=point(b.x-unit.x*endInset,b.y-unit.y*endInset);
    const margin=2/scale,bounded=p=>point(clamp(p.x,bounds.x+margin,bounds.x+bounds.width-margin),clamp(p.y,bounds.y+margin,bounds.y+bounds.height-margin));
    let p1,p2;
    if(route.mode==='SEA'){
      const lane=clamp(Math.max(a.x,b.x)+Math.max(65/scale,d*.22)+(index%16)*13/scale,bounds.x+margin,bounds.x+bounds.width-margin);
      p1=point(lane,p0.y);p2=point(lane,p3.y);
      // Nearby sea departures need a bow even when both cities sit on the east edge.
      if(Math.abs(lane-p0.x)<12/scale&&Math.abs(lane-p3.x)<12/scale){p1.y-=25/scale;p2.y-=25/scale;}
    }else{
      const short=d*scale<50,fan=((index%7)-3)*3/scale;
      const bow=short?Math.max(22/scale,d*.65)+Math.abs(fan):clamp(d*.12+fan,-30/scale,30/scale);
      p1=point(p0.x+(p3.x-p0.x)/3+normal.x*bow,p0.y+(p3.y-p0.y)/3+normal.y*bow);
      p2=point(p0.x+2*(p3.x-p0.x)/3+normal.x*bow,p0.y+2*(p3.y-p0.y)/3+normal.y*bow);
    }
    const pts=[p0,p1,p2,p3].map(bounded);
    function at(t){const u=1-t;return point(u*u*u*pts[0].x+3*u*u*t*pts[1].x+3*u*t*t*pts[2].x+t*t*t*pts[3].x,u*u*u*pts[0].y+3*u*u*t*pts[1].y+3*u*t*t*pts[2].y+t*t*t*pts[3].y);}
    const end=at(1),prev=at(.97),length=Math.hypot(end.x-prev.x,end.y-prev.y);
    const tangent=length>.00001?point((end.x-prev.x)/length,(end.y-prev.y)/length):unit;
    const headLength=Math.min((route.kind==='MAIN'?10:8)/scale,d*.27),headWidth=headLength*.53;
    const base=point(end.x-tangent.x*headLength,end.y-tangent.y*headLength);
    const head=[end,point(base.x-tangent.y*headWidth,base.y+tangent.x*headWidth),point(base.x+tangent.y*headWidth,base.y-tangent.x*headWidth)].map(bounded);
    const f=n=>Number(n.toFixed(3));
    return {points:pts,head,samples:Array.from({length:17},(_,i)=>at(i/16)),d:`M ${f(pts[0].x)} ${f(pts[0].y)} C ${pts.slice(1).map(p=>`${f(p.x)} ${f(p.y)}`).join(' ')}`,headD:`M ${head.map(p=>`${f(p.x)} ${f(p.y)}`).join(' L ')} Z`};
  }
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  function armyFlagRects(box,count,zoom=1.5){
    const columns=Math.min(5,count),spread=Math.max(0,columns-1)*15,result=[];
    for(let i=0;i<count;i++){const x=box.x+box.width/2-spread/2+(i%columns)*15,y=box.y+box.height/2-12+Math.floor(i/columns)*24-(count>5?9:0);result.push({x:x-12/zoom,y:y-15/zoom,width:38/zoom,height:44/zoom});}
    return result;
  }
  function markerAnchor(box,count,zoom=1.5,flags=[],neighbors=[],occupied=[]){
    const cx=box.x+box.width/2,cy=box.y+box.height/2,spread=Math.max(0,Math.min(5,count)-1)*15,r=12/zoom,rows=Math.max(1,Math.ceil(count/5)),base=cy-12-(count>5?9:0);
    const candidates=[point(cx-spread/2-26/zoom,cy+3/zoom),point(cx+spread/2+42/zoom,cy+3/zoom),point(cx,base-29/zoom),point(cx,base+(rows-1)*24+43/zoom),point(box.x+10/zoom,box.y+10/zoom),point(box.x+box.width-10/zoom,box.y+box.height-10/zoom)];
    let best=null;
    candidates.forEach((p,i)=>{
      p=point(clamp(p.x,r,1448-r),clamp(p.y,r,1086-r));const a={x:p.x-r,y:p.y-r,width:2*r,height:2*r};
      const own=Math.max(0,a.width*a.height-overlap(a,box)),score=flags.reduce((n,b)=>n+overlap(a,b),0)*10000+occupied.reduce((n,b)=>n+overlap(a,b),0)*2000+neighbors.reduce((n,b)=>n+overlap(a,b),0)*30+own*8+Math.hypot(p.x-cx,p.y-cy)*.5+i;
      if(!best||score<best.score)best={...p,score};
    });
    return {x:best.x,y:best.y};
  }
  function placeWindow(area,size,anchor,obstacles=[],samples=[]){
    const pad=Math.min(8,area.width/4,area.height/4),w=Math.min(size.width,Math.max(1,area.width-2*pad)),h=Math.min(size.height,Math.max(1,area.height-2*pad));
    const maxX=Math.max(pad,area.width-w-pad),maxY=Math.max(pad,area.height-h-pad);
    const xs=[anchor.x+32,anchor.x-w-32,maxX,maxX-45,pad],ys=[anchor.y-h/2,anchor.y+28,anchor.y-h-28,pad,maxY,area.height/2-h/2];
    let best=null;
    // Fixed 30 candidates, never an unbounded collision-resolution loop.
    for(const x0 of xs)for(const y0 of ys){
      const r={x:clamp(x0,pad,maxX),y:clamp(y0,pad,maxY),width:w,height:h};
      const occupied=obstacles.reduce((n,o)=>n+overlap(r,o),0);
      const crossed=samples.reduce((n,p)=>n+(p.x>=r.x&&p.x<=r.x+w&&p.y>=r.y&&p.y<=r.y+h?1:0),0);
      const coversAnchor=anchor.x>=r.x-16&&anchor.x<=r.x+w+16&&anchor.y>=r.y-16&&anchor.y<=r.y+h+16;
      const distance=Math.hypot(r.x+w/2-anchor.x,r.y+h/2-anchor.y);
      const score=occupied*4+crossed*220+(coversAnchor?100000:0)+distance*.18+(maxX-r.x)*.1;
      if(!best||score<best.score)best={...r,score};
    }
    return best;
  }
  return{FACTIONS,COLORS,STAR,ongoing,mapColor,forces,collectRoutes,routeGeometry,placeWindow,roleOrder,battleMonth,armyFlagRects,markerAnchor};
});
