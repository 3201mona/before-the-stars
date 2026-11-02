'use strict';
/* The hue must describe city geography, never attack/selection/adjacency state. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../runtime',name),'utf8');
const css=read('route_connection_lens_v1.css'),js=read('route_connection_lens_v1.js');
const map=read('canonical_map_runtime_v0_66.js');
const data=vm.runInNewContext(map.slice(0,map.indexOf('const seaZoneByUnit = {}'))+';({units,topology})');
assert.equal(Object.keys(data.units).length,50);
assert.equal(data.topology.edges.length,104);

const palette={};
for(const type of ['port','inland','landing']){
  const color=css.match(new RegExp('--route-lens-'+type+':(#[0-9a-fA-F]{6})'))?.[1];
  assert.ok(color,type+' has one centralized palette token');
  palette[type]=color.toLowerCase();
  assert.match(css,new RegExp('route-lens-marker\\.'+type+' \\.route-lens-dot\\{fill:var\\(--route-lens-'+type+'\\)\\}'));
  const legend=type==='landing'?'coast':type;
  assert.match(css,new RegExp('route-key-'+legend+'\\{color:var\\(--route-lens-'+type+'\\)\\}'));
  assert.match(js,new RegExp('route-key-'+legend));
}
assert.equal(new Set(Object.values(palette)).size,3,'three visually distinct marker categories');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([,selector,declarations])=>({selector,declarations})).filter(r=>r.selector.includes('.route-lens-dot'));
for(const {selector,declarations} of rules){
  if(/\.route-lens-marker\.(origin|target|neighbor|other)|:hover|:focus-visible/.test(selector)){
    assert.doesNotMatch(declarations,/\b(?:fill|stroke|opacity)\s*:/,'selection and hover never recolor markers: '+selector);
  }
}
const counts={port:0,inland:0,landing:0};
for(const u of Object.values(data.units))counts[u.naval_class==='PORT'?'port':u.naval_class==='LANDING_ONLY'?'landing':'inland']++;
assert.equal(Object.values(counts).reduce((s,n)=>s+n,0),50);
assert.match(css,/\.route-lens-ring\{fill:none/,'selected origin has a separate ring highlight');
assert.match(css,/\.route-lens-marker\.target \.route-lens-ring/,'selected destination has separate ring highlight');
console.log('PASS fixed connection marker palette: '+JSON.stringify({palette,city_counts:counts,edges:104}));
