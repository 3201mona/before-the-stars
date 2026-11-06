'use strict';
/* β19: different geometry for every geography class, larger map glyphs,
 * and a national-information SVG board that wins sibling paint order.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../runtime',name),'utf8');
const route=read('route_connection_lens_v1.js');
const css=read('route_connection_lens_v1.css');
const zoom=read('strategy_map_zoom_v1.js');
const html=read('game.html');
const map=read('canonical_map_runtime_v0_66.js');
const {units}=vm.runInNewContext(map.slice(0,map.indexOf('const seaZoneByUnit = {}'))+';({units})');
const functionText=(source,start,end)=>{
  const a=source.indexOf('  function '+start+'('),b=source.indexOf('  function '+end+'(',a+1);
  assert.ok(a>=0&&b>a,'source function boundaries '+start);
  return source.slice(a,b);
};
let assertions=0;
function check(actual,expected,label){assert.equal(actual,expected,label);assertions++;}

function svg(tag,attrs={}){return{tag,attrs,children:[],appendChild(child){this.children.push(child);}};}
const layer=svg('g');
const drawing={units,origin:'MA_03',target:'MA_02',layer,svg,
  name:id=>id,neighbor:(a,b)=>a==='MA_03'&&b==='MA_02'?{type:'land'}:null};
vm.runInNewContext(functionText(route,'addCityMarker','updatePanel')+'; this.draw=addCityMarker;',drawing);
for(const id of Object.keys(units))drawing.draw(id);
const groups=layer.children.filter(child=>child.tag==='g');
check(groups.length,50,'all 50 city symbols are drawn');
const glyph=id=>groups.find(g=>g.attrs['data-route-city']===id)?.children.find(c=>c.attrs.class==='route-lens-dot');
const classification={PORT:'circle',INLAND:'rect',LANDING_ONLY:'path'};
const counts={circle:0,rect:0,path:0};
for(const [id,city] of Object.entries(units)){
  const expected=classification[city.naval_class],actual=glyph(id)?.tag;
  check(actual,expected,'symbol shape for '+id);
  counts[actual]++;
  if(actual==='circle')assert.ok(Number(glyph(id).attrs.r)>=4.8,'port circle is larger than previous 3.2px radius');
  if(actual==='rect')assert.ok(Number(glyph(id).attrs.width)>=9.5,'inland square is at least 9.5px wide');
}
check(counts.circle,22,'ports');check(counts.rect,22,'inland');check(counts.path,6,'landing-only');
const triangle=glyph('NY_05').attrs.d;
assert.match(triangle,/L\d+(?:\.\d+)?,\d+(?:\.\d+)?/,'triangle path is present');assertions++;
assert.match(route,/r:16,class:'route-lens-hit'/,'larger hit targets');assertions++;
assert.match(route,/route-key-port"><b class="route-symbol" aria-hidden="true">●<\/b>/);assertions++;
assert.match(route,/route-key-inland"><b class="route-symbol" aria-hidden="true">■<\/b>/);assertions++;
assert.match(route,/route-key-coast"><b class="route-symbol" aria-hidden="true">▲<\/b>/);assertions++;
assert.match(css,/\.route-lens-key \.route-symbol\{font-size:17px/,'legend symbols are enlarged');assertions++;

const board={id:'political-situation-window',parentNode:null};
const armyFlags={id:'field-army-markers',parentNode:null};
const connectionLayer={id:'route-lens-layer',parentNode:null};
const root={children:[],get lastElementChild(){return this.children.at(-1)||null;},
  appendChild(node){this.children=this.children.filter(n=>n!==node);this.children.push(node);node.parentNode=this;return node;}};
root.appendChild(board);
const hud={map:root,$:id=>id==='political-situation-window'?board:null};
vm.runInNewContext(zoom.match(/  function keepPoliticalBoardFront\(\)\{[\s\S]*?\n  \}/)[0]+';this.raise=keepPoliticalBoardFront;',hud);
root.appendChild(armyFlags);
check(root.lastElementChild===board,false,'new army flags initially hide an older SVG HUD');
hud.raise();check(root.lastElementChild,board,'HUD is restored above army flags');
root.appendChild(connectionLayer);
hud.raise();check(root.lastElementChild,board,'HUD is restored above connection markers');
assert.match(zoom,/boardLayerObserver\.observe\(map,\{childList:true\}\)/,'future direct child layers trigger restoration');assertions++;
assert.match(zoom,/function pinPoliticalPanel\(\)\{\s*keepPoliticalBoardFront\(\)/,'scroll pin refresh also restores HUD order');assertions++;
assert.match(html,/route_connection_lens_v1\.css\?v=20261102-beta19-shape-hud/,'CSS version bumps for browsers');assertions++;
assert.match(html,/route_connection_lens_v1\.js\?v=20261102-beta19-shape-hud/,'route JS version bumps');assertions++;
assert.match(html,/strategy_map_zoom_v1\.js\?v=20261102-beta19-hud-layer/,'SVG HUD JS version bumps');assertions++;
console.log('PASS beta19 shape/size and SVG top layer: '+assertions+' assertions, '+JSON.stringify(counts));
