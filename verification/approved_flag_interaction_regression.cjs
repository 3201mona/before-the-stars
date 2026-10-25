/* Command-mode click-through integration guard; executable without a browser. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../runtime');
const cityCode=fs.readFileSync(path.join(root,'canonical_city_runtime_v0_74_retreat.js'),'utf8');
const armyCode=fs.readFileSync(path.join(root,'army_phase2_ui_v0_77_portraits.js'),'utf8');
const html=fs.readFileSync(path.join(root,'game.html'),'utf8');
const begin=cityCode.indexOf('  function renderMap(){');
const end=cityCode.indexOf('  function renderCommandButtons()',begin);
assert(begin>=0&&end>begin,'command map rendering function must exist');
const renderMap=cityCode.slice(begin,end);

for(const command of ['ATTACK','MOVE','TRANSPORT',null]){
  const states=[];
  const layer={classList:{toggle:(key,enabled)=>states.push({key,enabled})}};
  const props={
    document:{},
    $:id=>id==='field-army-markers'?layer:id==='naval-info'?{hidden:true}:null,
    clearMap(){},setMapClass(){},
    state:{cities:{}},selectedId:null,selectedNavalZone:null,
    activeCommand:command,candidateIds:new Set(['RI_01']),targetId:null
  };
  vm.runInNewContext(renderMap+'\nrenderMap();',props);
  assert.equal(states.length,1,`renderMap updates overlay for ${command}`);
  assert.equal(states[0].key,'destination-selection');
  assert.equal(states[0].enabled,command!==null,`flag layer click-through for ${command}`);
}
assert(armyCode.includes('.field-army-markers.destination-selection .field-army-marker{pointer-events:none!important}'));
assert(armyCode.includes("layer.classList.toggle('destination-selection'"));
assert(armyCode.includes('window.BTSArmyMarkerOffsets?.calculateOffsets('));
const geomLoad=html.indexOf('src="army_marker_offsets_v1.js');
const markersLoad=html.indexOf('src="army_phase2_ui_v0_77_portraits.js');
assert(geomLoad>=0&&geomLoad<markersLoad,'offset script must load before army UI');
for(const file of [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1])){
  if(/^https?:\/\//.test(file))continue;
  assert(fs.existsSync(path.join(root,file.split('?')[0])),`missing JavaScript: ${file}`);
}
const start=html.indexOf('<g id="40_click_regions">');
const next=html.indexOf('</g>',start);
assert(start>=0&&next>start);
const clickArea=html.slice(start,next+4);
assert.equal(crypto.createHash('sha256').update(clickArea).digest('hex'),
  '1d2096d00a600924481c9f4797d286cb7511687bd527bc4c4aae8f6d45290aa8',
  'original 50 city click paths remain byte-for-byte unchanged');
console.log('PASS: city-destination click-through (attack/move/transport), army pointer restoration, script links, original map click layer');
