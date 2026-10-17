(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const FACTION_LABEL={PATRIOT:'アメリカ独立派',BRITISH:'イギリス王党派'};
  const CHIEF_ID={PATRIOT:'CMD_PAT_WASHINGTON',BRITISH:'CMD_BRI_GAGE'};
  const OPENING={
    PATRIOT:[
      {date:'1620年',title:'始まりの岸辺',image:'assets/opening/01_pilgrim_arrival.png',speaker:'CHIEF',text:'我々のはじまりは厳冬のニューイングランドだ。遠い本国など当てにはしない。自ら土地を拓き、自らを治め、信仰と共に自ら生き抜く――その気風は今もなお受け継がれている。'},
      {date:'1763年以後',title:'帝国と植民地',image:'assets/opening/02_imperial_taxation.png',speaker:'CHIEF',text:'時は流れ、旧大陸では七年戦争が勃発。英国はその膨大な戦費を賄うため、我々にも負担を押しつけてきた。しかし英国の本国議会には我々の代表はいない。ならば答えは一つだ。　「代表なくして課税なし！」'},
      {date:'1770年3月',title:'ボストンの流血',image:'assets/opening/03_boston_massacre.png',speaker:'CHIEF',text:'ボストンではついに血が流れる。英軍兵士が群衆へと発砲し五人の市民が命を落としたのだ。これにより英国への不信は怒りへと変わり、植民地じゅうへ燃え広がったのだ。'},
      {date:'1773年12月',title:'海へ投じられた茶',image:'assets/opening/04_boston_tea_party.png',speaker:'CHIEF',text:'積み荷の茶はすべてがボストン港に投げ捨てられた。茶法への抗議、税への反発――この事件が示したものはそれだけではない。我々は本国の命令に黙って従うだけの存在ではないのだと、この地に生きる人々が、その行動によって意志を示したのだ。'},
      {date:'1774年',title:'閉ざされた港',image:'assets/opening/05_boston_port_closed.png',speaker:'CHIEF',text:'英国はボストン港を閉鎖するという強硬策に出た。マサチューセッツを孤立させれば、反抗の火は消える――本国議会はそう考えたようだ。だが結果は逆となった。他の植民地はマサチューセッツを支えることを決断、ここに大陸会議が開かれ、十三植民地は共に助け合い英国と向き合う道を選んだのだ！'},
      {date:'1775年6月',title:'戦争の始まり',image:'assets/opening/06_june_1775_standoff.png',speaker:'CHIEF',text:'レキシントンとコンコードで、ついに銃火が交わされた。ゲージ将軍の英軍はボストンに集結している。我が軍はウスターを中心に戦列をいそぎ整える。十三植民地を結び、自由を勝ち取る――ここから我々の戦いが始まるのだ！'}
    ],
    BRITISH:[
      {date:'1620年',title:'帝国の新しい岸辺',image:'assets/opening/01_pilgrim_arrival.png',text:'国王の臣民は大西洋を渡り、北米の厳しい土地に新たな共同体を築きました。植民地は本国の商業と海軍に守られながら成長し、やがて帝国の重要な一部となっていきます。'},
      {date:'1763年以後',title:'帝国を守る代償',image:'assets/opening/02_imperial_taxation.png',text:'本国は七年戦争でフランスを退け、北米植民地を守りました。その戦費は莫大なものでしたので、議会は植民地にも負担を求めたのです。ですが大きな反発を受け、本国の統治そのものへ批判が起こりました。'},
      {date:'1770年3月',title:'ボストンの騒擾',image:'assets/opening/03_boston_massacre.png',text:'ボストンでは群衆と守備兵の衝突が続き、混乱の中で発砲が起きました。これは不幸な事件でありましたが、急進派がこれを宣伝に利用、植民地全体で兵士と住民との間の信頼を大きく損なう結果となりました。'},
      {date:'1773年12月',title:'踏みにじられた法',image:'assets/opening/04_boston_tea_party.png',text:'覆面の一団が商船へ押し入り、東インド会社の茶を海へ投棄しました。これは合法な抗議ではありません。私有財産と議会の権威が公然と否定されたのです。本国が秩序回復に動くのは当然のことです。'},
      {date:'1774年',title:'ボストン港の封鎖',image:'assets/opening/05_boston_port_closed.png',text:'議会は強圧諸法を定め、損害が償われるまでボストン港の閉鎖を行います。ところが植民地の各委員会は連携を強め、非合法な大陸会議と民兵組織が生まれ、帝国の統治へ挑み始めたのです。'},
      {date:'1775年6月',title:'反乱を鎮めよ',image:'assets/opening/06_june_1775_standoff.png',speaker:'CHIEF',text:'レキシントンとコンコードで、武装民兵が国王軍へ銃を向けた。北米英軍はボストンを確保しているが、反乱軍はウスター方面に兵を集めている。道路と港を押さえ、植民地に国王陛下の秩序を取り戻すのだ。'}
    ]
  };

  let pendingFaction=null,sceneIndex=0,front=0,transitioning=false;
  const style=document.createElement('style');style.textContent=`
    #opening-confirm-screen,#opening-sequence-screen{position:fixed;inset:0;box-sizing:border-box;color:#f6edd8}
    #opening-confirm-screen[hidden],#opening-sequence-screen[hidden]{display:none!important}
    #opening-confirm-screen{z-index:720;display:grid;place-items:center;padding:18px;background:#020608d9}
    .opening-confirm-card{width:min(540px,94vw);box-sizing:border-box;border:5px double #c9a03b;background:linear-gradient(180deg,#293b40,#10191e);box-shadow:0 24px 80px #000;padding:22px}
    .opening-confirm-title{font-family:'Yu Mincho','Hiragino Mincho ProN',serif;font-size:25px;font-weight:900;color:#ffe279}
    .opening-confirm-message{margin:16px 0 20px;font-size:18px;line-height:1.7}
    .opening-confirm-actions,.opening-actions{display:flex;justify-content:flex-end;gap:11px}.opening-confirm-actions button,.opening-actions button{min-width:124px;margin:0;padding:10px 17px;font-size:16px}
    #opening-sequence-screen{z-index:760;display:grid;place-items:center;padding:16px;background:radial-gradient(circle at 50% 34%,#20363dcc,#020506 80%)}
    .opening-card{width:min(1040px,97vw);max-height:97vh;overflow:auto;box-sizing:border-box;border:6px double #c9a03b;background:#0b1114;box-shadow:0 25px 95px #000}
    .opening-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:14px;padding:11px 20px 9px;background:linear-gradient(180deg,#26373c,#111a1e)}
    .opening-faction{font-size:14px;color:#d4c391}.opening-title{text-align:center;font-family:'Yu Mincho','Hiragino Mincho ProN',serif;font-size:clamp(26px,4vw,42px);font-weight:900;letter-spacing:.08em;color:#ffe69a;text-shadow:0 2px 8px #000}.opening-progress{text-align:right;font-size:14px;color:#b9c6c5}
    .opening-scene{position:relative;isolation:isolate;height:min(54vh,520px);min-height:280px;overflow:hidden;border-top:1px solid #8f793f;border-bottom:1px solid #8f793f;background:#111b20}
    .opening-scene::after{content:'';position:absolute;inset:0;z-index:2;background:linear-gradient(180deg,transparent 61%,#05090bd8);pointer-events:none}
    .opening-scene-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.025);transition:opacity 1.15s ease,transform 7s ease}.opening-scene-image.active{opacity:1;transform:scale(1)}
    .opening-scene-label{position:absolute;z-index:3;left:18px;right:18px;bottom:12px;text-align:center;font-family:'Yu Mincho','Hiragino Mincho ProN',serif;font-size:19px;color:#fff1c5;text-shadow:0 2px 6px #000}
    .opening-dialogue{display:grid;grid-template-columns:102px minmax(0,1fr);gap:15px;align-items:center;min-height:134px;padding:13px 20px;background:linear-gradient(180deg,#26363b,#111b20)}
    .opening-speaker-portrait{width:98px;height:120px;object-fit:cover;image-rendering:pixelated;border:3px double #c9a03b;background:#142127}.opening-speaker-name{font-size:15px;color:#d4c391}.opening-speaker-text{margin-top:6px;font-size:18px;line-height:1.65}
    .opening-actions{align-items:center;padding:11px 16px;background:#0b1114}.opening-actions #opening-return-title{margin-right:auto}.opening-actions #opening-next{min-width:180px;font-weight:900}
    .opening-patriot #opening-next{border-color:#779dd9}.opening-british #opening-next{border-color:#d9897f}
    @media(max-width:650px){.opening-header{grid-template-columns:1fr auto}.opening-title{grid-column:1/-1;grid-row:1}.opening-faction{grid-row:2}.opening-progress{grid-row:2}.opening-dialogue{grid-template-columns:76px minmax(0,1fr);padding:10px}.opening-speaker-portrait{width:72px;height:89px}.opening-speaker-text{font-size:15px}.opening-scene{min-height:230px}.opening-actions button{min-width:0}}
  `;document.head.appendChild(style);

  const confirm=document.createElement('div');confirm.id='opening-confirm-screen';confirm.hidden=true;confirm.innerHTML='<section class="opening-confirm-card" role="dialog" aria-modal="true" aria-labelledby="opening-confirm-title"><div id="opening-confirm-title" class="opening-confirm-title">新規ゲーム確認</div><div id="opening-confirm-message" class="opening-confirm-message"></div><div class="opening-confirm-actions"><button id="opening-confirm-execute">実行</button><button id="opening-confirm-cancel">取消</button></div></section>';document.body.appendChild(confirm);
  const screen=document.createElement('div');screen.id='opening-sequence-screen';screen.hidden=true;screen.innerHTML='<section class="opening-card" role="dialog" aria-modal="true" aria-label="オープニング"><div class="opening-header"><div id="opening-faction" class="opening-faction"></div><div id="opening-title" class="opening-title"></div><div id="opening-progress" class="opening-progress"></div></div><div class="opening-scene"><img id="opening-scene-a" class="opening-scene-image" alt=""><img id="opening-scene-b" class="opening-scene-image" alt=""><div id="opening-scene-label" class="opening-scene-label"></div></div><div class="opening-dialogue"><img id="opening-speaker-portrait" class="opening-speaker-portrait" alt=""><div><div id="opening-speaker-name" class="opening-speaker-name"></div><div id="opening-speaker-text" class="opening-speaker-text" aria-live="polite"></div></div></div><div class="opening-actions"><button id="opening-return-title">スタート画面へ戻る</button><button id="opening-next">次へ</button></div></section>';document.body.appendChild(screen);

  function commander(faction){const state=window.__phase2UI?.getState?.();return state?.commanders?.[CHIEF_ID[faction]]||window.COMMANDER_ENCYCLOPEDIA_V0_82?.entries?.find(entry=>entry.id===CHIEF_ID[faction])||null;}
  function speakerFor(scene,faction){if(scene.speaker==='CHIEF'){const chief=commander(faction);return{name:chief?.name||'総司令官',portrait:chief?.portrait||''};}const adjutant=window.POLITICAL_PHASE_CONFIG?.adjutants?.[faction]||{};return{name:adjutant.name||`${FACTION_LABEL[faction]}副官`,portrait:adjutant.portrait||''};}
  function showScene(index,instant=false){const scenes=OPENING[pendingFaction],scene=scenes[index],speaker=speakerFor(scene,pendingFaction),images=[$('opening-scene-a'),$('opening-scene-b')],next=images[front],previous=images[1-front];sceneIndex=index;$('opening-faction').textContent=FACTION_LABEL[pendingFaction];$('opening-title').textContent=scene.title;$('opening-progress').textContent=`${index+1} / ${scenes.length}`;$('opening-scene-label').textContent=`${scene.date}　${scene.title}`;$('opening-speaker-name').textContent=speaker.name;$('opening-speaker-text').textContent=scene.text;$('opening-speaker-portrait').src=speaker.portrait;$('opening-speaker-portrait').alt=speaker.name;$('opening-next').textContent=index===scenes.length-1?'ゲーム開始':'次へ';next.classList.remove('active');next.alt=`${scene.date} ${scene.title}`;next.onload=()=>{previous.classList.remove('active');requestAnimationFrame(()=>next.classList.add('active'));transitioning=false;$('opening-next').disabled=false;};transitioning=true;$('opening-next').disabled=true;next.src=scene.image;if(next.complete){previous.classList.remove('active');requestAnimationFrame(()=>next.classList.add('active'));transitioning=false;$('opening-next').disabled=false;}front=1-front;const following=scenes[index+1];if(following){const preload=new Image();preload.src=following.image;}if(instant){next.style.transitionDuration='0s';requestAnimationFrame(()=>{next.style.transitionDuration='';});}}
  function beginOpening(){confirm.hidden=true;screen.className=`opening-${pendingFaction.toLowerCase()}`;screen.hidden=false;document.documentElement.classList.add('opening-active');front=0;showScene(0,true);window.__openingBGM?.play?.(false);}
  function closeOpening(){confirm.hidden=true;screen.hidden=true;document.documentElement.classList.remove('opening-active');pendingFaction=null;sceneIndex=0;transitioning=false;window.__gameStartUI?.showStart?.();}
  function requestStart(faction){if(!OPENING[faction])return;pendingFaction=faction;$('opening-confirm-message').textContent=`${FACTION_LABEL[faction]}ではじめますか？　実行するとオープニングが始まります。`;$('opening-confirm-execute').className=faction==='PATRIOT'?'patriot':'british';confirm.hidden=false;}
  function nextScene(){if(transitioning||!pendingFaction)return;const scenes=OPENING[pendingFaction];if(sceneIndex>=scenes.length-1){window.__openingBGM?.stop?.(true);window.__gameStartUI?.startNew?.(pendingFaction);return;}showScene(sceneIndex+1);}

  $('opening-confirm-cancel').addEventListener('click',()=>{confirm.hidden=true;pendingFaction=null;});
  $('opening-confirm-execute').addEventListener('click',beginOpening);
  $('opening-return-title').addEventListener('click',closeOpening);
  $('opening-next').addEventListener('click',nextScene);
  screen.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.repeat){event.preventDefault();nextScene();}});
  window.BeforeTheStarsOpening={version:'0.89',requestStart,beginOpening,closeOpening,scenes:OPENING,isActive:()=>!screen.hidden};
})();
