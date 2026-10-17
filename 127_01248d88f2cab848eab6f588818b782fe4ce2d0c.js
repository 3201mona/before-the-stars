/* BEFORE THE STARS — enemy attack presentation. Covered by the package LICENSE.txt. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnemyAttackIntroModel=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const ZONES={NORTH:0,CENTRAL:1,SOUTH:2},clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function durationFor(battle,cities){if(battle.route_type!=='LANDING_ATTACK')return 3000;const a=ZONES[cities.cities?.[battle.origin_city_id]?.geography?.sea_zone_id],b=ZONES[cities.cities?.[battle.city_id]?.geography?.sea_zone_id];return Number.isInteger(a)&&Number.isInteger(b)?3000+1500*Math.abs(a-b):3000;}
  const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  function prefix(points,t){t=clamp(Number(t)||0,0,1);const [a,b,c,d]=points,ab=mix(a,b,t),bc=mix(b,c,t),cd=mix(c,d,t),abc=mix(ab,bc,t),bcd=mix(bc,cd,t),end=mix(abc,bcd,t);return[a,ab,abc,end];}
  function pointAt(points,t){return prefix(points,t)[3];}
  function tangentAt(points,t){const [a,b,c,d]=points,u=1-t;return{x:3*u*u*(b.x-a.x)+6*u*t*(c.x-b.x)+3*t*t*(d.x-c.x),y:3*u*u*(b.y-a.y)+6*u*t*(c.y-b.y)+3*t*t*(d.y-c.y)};}
  function arcTable(points){const table=[{t:0,length:0}],steps=128;let previous=points[0],length=0;for(let i=1;i<=steps;i++){const t=i/steps,p=pointAt(points,t);length+=Math.hypot(p.x-previous.x,p.y-previous.y);table.push({t,length});previous=p;}return table;}
  function parameterAt(table,progress){const length=table[table.length-1].length*clamp(Number(progress)||0,0,1);for(let i=1;i<table.length;i++)if(table[i].length>=length){const a=table[i-1],b=table[i],span=b.length-a.length;return a.t+(b.t-a.t)*(span?(length-a.length)/span:0);}return 1;}
  function pathD(points){const f=n=>Number(n.toFixed(3));return`M ${f(points[0].x)} ${f(points[0].y)} C ${points.slice(1).map(p=>`${f(p.x)} ${f(p.y)}`).join(' ')}`;}
  function headD(point,tangent,scale){const length=Math.hypot(tangent.x,tangent.y)||1,ux=tangent.x/length,uy=tangent.y/length,size=10/scale,width=5.3/scale,base={x:point.x-ux*size,y:point.y-uy*size};return`M ${point.x} ${point.y} L ${base.x-uy*width} ${base.y+ux*width} L ${base.x+uy*width} ${base.y-ux*width} Z`;}
  function camera(point,scale,viewport,extent){return{left:clamp(point.x*scale.x-viewport.width/2,0,Math.max(0,extent.width-viewport.width)),top:clamp(point.y*scale.y-viewport.height*.57,0,Math.max(0,extent.height-viewport.height))};}
  function iconParts(sea,faction){const color=faction==='PATRIOT'?'#2768ff':'#f23943';if(sea)return[
    ['path',{d:'M -20 8 L 19 8 L 12 19 L -13 19 Z',fill:'#7b4823',stroke:'#fff1bd','stroke-width':1.7}],
    ['path',{d:'M -18 10 L 17 10 M -11 16 L 10 16',stroke:'#e0b264','stroke-width':1.3}],
    ['path',{d:'M -8 -18 L -8 9 M 6 -13 L 6 9',stroke:'#5b321c','stroke-width':3}],
    ['path',{d:'M -9 -15 L -19 4 L -9 4 Z M -6 -14 L 3 4 L -6 4 Z M 7 -10 L 17 5 L 7 5 Z',fill:'#fff1cc',stroke:'#514536','stroke-width':1.1}],
    ['path',{d:'M -8 -18 L 4 -17 L 0 -11 L -8 -12 Z',fill:color,stroke:'#ffe18b','stroke-width':1}],
    ['path',{d:'M -23 22 Q -18 18 -13 22 T -3 22 T 7 22 T 17 22',fill:'none',stroke:'#bfefff','stroke-width':1.8}]
  ];return[
    ['path',{d:'M -20 0 Q -25 -7 -22 -9 M -14 2 L -18 16 L -13 16 L -8 5 M 1 5 L 7 17 L 12 17 L 7 3',fill:'none',stroke:'#452914','stroke-width':4,'stroke-linecap':'square'}],
    ['path',{d:'M -17 -2 L 4 -3 L 7 -12 L 13 -16 L 15 -8 L 21 -5 L 20 -1 L 13 0 L 10 7 L -11 8 L -18 3 Z',fill:'#a77440',stroke:'#fff0b3','stroke-width':1.5}],
    ['path',{d:'M 7 -12 L 11 -10 L 7 -2 M 13 -16 L 12 -22 L 17 -15',fill:'#392717',stroke:'#392717','stroke-width':1.3}],
    ['path',{d:'M -9 -4 L 1 -4 L 0 5 L -8 5 Z',fill:color,stroke:'#e4c270','stroke-width':1}],
    ['path',{d:'M -4 -8 L -3 3 L 4 12',fill:'none',stroke:'#222938','stroke-width':3}],
    ['path',{d:'M -9 -17 L -1 -17 L 1 -7 L -7 -5 Z',fill:color,stroke:'#ffe7b0','stroke-width':1.2}],
    ['path',{d:'M -8 -16 L -1 -7 M -1 -14 L 6 -10',stroke:'#fff5da','stroke-width':1.7}],
    ['circle',{cx:-5,cy:-22,r:3.6,fill:'#ecc399',stroke:'#4a3022','stroke-width':1}],
    ['path',{d:'M -11 -25 L 1 -25 L -2 -29 L -8 -29 Z',fill:'#202836',stroke:'#ffe18b','stroke-width':1}],
    ['path',{d:'M 5 -10 L 14 -23 M 3 -10 L 8 -7',stroke:'#fff1bc','stroke-width':1.7,'stroke-linecap':'round'}]
  ];}
  return{durationFor,prefix,pointAt,tangentAt,arcTable,parameterAt,pathD,headD,camera,iconParts};
});
