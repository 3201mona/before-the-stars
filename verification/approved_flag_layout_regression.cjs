/* BEFORE THE STARS: approved A/5 flags per row, 150% hotspot geometry. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const geom=require('../runtime/army_marker_offsets_v1.js');

const html=fs.readFileSync(path.resolve(__dirname,'../runtime/game.html'),'utf8');
const boxes={};
for(const match of html.matchAll(/<path\s+class="unit-click"[^>]*>/g)){
  const tag=match[0];
  const id=tag.match(/data-unit="([^"]+)"/)?.[1];
  const d=tag.match(/\bd="([^"]+)"/)?.[1];
  if(!id||!d)continue;
  const points=[...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)];
  assert(points.length>2,`path ${id} malformed`);
  const xs=points.map(p=>+p[1]),ys=points.map(p=>+p[2]);
  boxes[id]={x:Math.min(...xs),y:Math.min(...ys),
    width:Math.max(...xs)-Math.min(...xs),
    height:Math.max(...ys)-Math.min(...ys)};
}
assert.equal(Object.keys(boxes).length,50,'unchanged set of 50 city hit paths');
const targetIds=new Set(geom.TARGET_CITIES);
assert.equal(targetIds.size,7);
let checked=0;
const samples=[];
function verify(groups,description){
  const shift=geom.calculateOffsets(groups,id=>boxes[id],1.5);
  assert.deepEqual(shift,geom.calculateOffsets(groups,id=>boxes[id],1.5),'deterministic positions');
  for(const id of Object.keys(shift))assert(targetIds.has(id),`unapproved city moved: ${id}`);
  const entries=Object.entries(groups).map(([id,count])=>({
    id,rect:geom.groupRect(boxes[id],count,1.5)}));
  const failures=[];
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
    const a=entries[i],b=entries[j];
    const area=geom.overlap(a.rect,b.rect,shift[a.id],shift[b.id]);
    if(area>0.0001)failures.push(`${a.id}/${b.id} ${area.toFixed(2)}`);
  }
  assert.equal(failures.length,0,`${description}: ${failures.join(', ')}`);
  checked++;
  return shift;
}
for(const [a,b] of geom.APPROVED_PAIRS){
  for(const count of [10,8,7]){
    const shifts=verify({[a]:count,[b]:count},`${a}/${b} ${count}vs${count}`);
    if(count===10)samples.push({pair:`${a}/${b}`,shifts});
  }
}
for(const count of [10,8,7]){
  const all=Object.fromEntries(geom.TARGET_CITIES.map(id=>[id,count]));
  verify(all,`all seven simultaneous ${count}`);
}
const lonely=geom.calculateOffsets({RI_01:1},id=>boxes[id],1.5);
assert.deepEqual(lonely,{},'no offset outside collision cases');
console.log(`PASS: ${checked} simultaneous/city-pair scenarios, 50 paths, seven permitted hotspots`);
console.log('10v10 representative city-group shifts:',JSON.stringify(samples));
