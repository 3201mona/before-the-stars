'use strict';
// Optional Chromium integration probe; requires an installed Playwright runtime.
// It starts a local-only HTTP server and does not access the published game.
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{
 let candidate;
 try{candidate=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}
 if(!candidate.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(candidate,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(candidate)]||'application/octet-stream'});
  fs.createReadStream(candidate).pipe(res);
 });
});
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=()=>new Promise(resolve=>server.close(resolve));
(async()=>{
 await listen();
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1365,height:920}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/runtime/game.html',{waitUntil:'load'});
  await page.locator('[data-start-faction="PATRIOT"]').click();
  await page.locator('#opening-confirm-execute').click();
  for(let i=0;i<6;i++)await page.locator('#opening-next').click();
  await page.locator('#adjutant-notice-modal').waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(400);
  const first=await page.evaluate(()=>({
   bgmOn:document.getElementById('bgm-toggle-political')?.getAttribute('aria-pressed')==='true',
   audioExists:!!document.getElementById('political-phase-bgm'),
   paused:document.getElementById('political-phase-bgm')?.paused,
   noMediaError:!document.getElementById('political-phase-bgm')?.error
  }));
  assert.ok(first.bgmOn,'political BGM switch must remain ON');
  assert.ok(first.audioExists,'first council must create the political BGM element');
  assert.ok(first.noMediaError,'political audio must decode');
  // A reload may lose the browser user gesture. This first meeting click must
  // retry playback even when the initial play() was rejected.
  await page.locator('#adjutant-notice-confirm').click();
  await page.waitForFunction(()=>{const a=document.getElementById('political-phase-bgm');return a&&!a.paused&&a.readyState>=2;},{timeout:10000});
  const before=await page.locator('#political-phase-bgm').evaluate(a=>a.currentTime);
  await page.waitForTimeout(400);
  const after=await page.locator('#political-phase-bgm').evaluate(a=>a.currentTime);
  assert.ok(after>before,'music time must advance after the first council interaction');
  const gameErrors=errors.filter(x=>!/favicon/i.test(x));
  assert.deepEqual(gameErrors,[],'no game script errors');
  console.log('PASS real browser: independent-side first council, initial BGM created, click retry plays, time '+before.toFixed(2)+' -> '+after.toFixed(2)+' sec');
 }finally{
  if(browser)await browser.close();
  await close();
 }
})().catch(e=>{console.error('FAIL real browser:',e.stack||e);process.exitCode=1;});
