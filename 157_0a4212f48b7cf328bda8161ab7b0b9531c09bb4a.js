(function(){
  'use strict';
  const FACTOR=1.5;
  const MAP_VIEWBOX={width:1448,height:1086};
  const $=id=>document.getElementById(id);

  window.__strategyMapZoom={factor:FACTOR,markerScale:1/FACTOR};

  const style=document.createElement('style');
  style.textContent=`
    .strategy-map-scroll{
      position:relative;
      width:100%;
      height:min(100vh,1086px);
      overflow:auto;
      flex:0 0 auto;
      background:#075ba8;
      overscroll-behavior:contain;
    }
    .strategy-map-scroll #game-map{
      display:block;
      width:auto;
      max-width:none !important;
      height:auto !important;
      background:#075ba8;
    }
    #game-map #00_background_image image,
    #game-map #coast-dot-protection image,
    #game-map #legacy-legend-cover{
      image-rendering:crisp-edges;
      image-rendering:pixelated;
    }
    .strategy-map-scroll:focus-visible{outline:2px solid #d0a330;outline-offset:-2px}
  `;
  document.head.appendChild(style);

  const map=$('game-map');
  if(!map)return;

  // The obsolete prototype legend is baked into the canonical raster. Do not regenerate or rewrite
  // that raster. Cover only the legacy legend footprint with a deterministic crop sampled from
  // the same accepted wilderness artwork, placed beneath every support/click/border layer.
  function installLegacyLegendCover(){
    if($('legacy-legend-cover'))return;
    const NS='http://www.w3.org/2000/svg';
    const cover=document.createElementNS(NS,'image');
    cover.id='legacy-legend-cover';
    cover.setAttribute('x','0');
    cover.setAttribute('y','104');
    cover.setAttribute('width','330');
    cover.setAttribute('height','290');
    cover.setAttribute('preserveAspectRatio','none');
    cover.setAttribute('href','assets/map/legacy_legend_cover_v1.png');
    cover.setAttributeNS('http://www.w3.org/1999/xlink','href','assets/map/legacy_legend_cover_v1.png');
    cover.style.pointerEvents='none';
    cover.style.imageRendering='pixelated';
    const support=$('support-display-regions');
    if(support&&support.parentNode===map)map.insertBefore(cover,support);else map.insertBefore(cover,map.firstChild?.nextSibling||null);
  }
  installLegacyLegendCover();

  let scroller=$('strategy-map-scroll');
  if(!scroller){
    scroller=document.createElement('div');
    scroller.id='strategy-map-scroll';
    scroller.className='strategy-map-scroll';
    scroller.tabIndex=0;
    scroller.setAttribute('aria-label','拡大戦略図。スクロールして地図を移動できます');
    map.parentNode.insertBefore(scroller,map);
    scroller.appendChild(map);
  }

  function syncMapSize(){
    const wrap=$('map-wrap');
    if(!wrap)return;
    map.style.setProperty('width',`${wrap.clientWidth*FACTOR}px`,'important');
  }
  function svgScale(){
    const rect=map.getBoundingClientRect();
    return {
      x:rect.width/MAP_VIEWBOX.width,
      y:rect.height/MAP_VIEWBOX.height
    };
  }
  function pinPoliticalPanel(){
    const group=$('political-situation-window');
    if(!group)return;
    const scale=svgScale();
    const x=scale.x?scroller.scrollLeft/scale.x:0;
    const y=scale.y?scroller.scrollTop/scale.y:0;
    group.setAttribute('transform',`translate(${x} ${y}) scale(${1/FACTOR})`);
  }
  function initialPosition(){
    syncMapSize();
    // Colonies and starting armies are concentrated on the Atlantic side.
    // Open with the eastern edge visible; the western wilderness remains one scroll away.
    scroller.scrollLeft=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    scroller.scrollTop=0;
    pinPoliticalPanel();
  }
  let raf=0;
  function onScroll(){
    if(raf)return;
    raf=requestAnimationFrame(()=>{raf=0;pinPoliticalPanel();});
  }
  scroller.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',()=>{syncMapSize();onScroll();},{passive:true});

  requestAnimationFrame(()=>requestAnimationFrame(initialPosition));
  window.__strategyMapZoom={
    factor:FACTOR,
    markerScale:1/FACTOR,
    scroller,
    pinPoliticalPanel,
    focusEast:initialPosition,
    syncMapSize,
    getScroll:()=>({left:scroller.scrollLeft,top:scroller.scrollTop})
  };
})();
