// Headless Chromium smoke for the isolated MV3 candidate on a LOCAL synthetic lesson.
// Does NOT touch real Udemy or the user's Chrome profile. No external dependencies.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const ext=path.join(root,"extension-candidate");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"bgct-chromium-smoke-"));
const cert=path.join(tmp,"cert.pem"),key=path.join(tmp,"key.pem"),profile=path.join(tmp,"chrome");
const launched=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function chromePath(){
 for(const name of [process.env.CHROME_PATH,"google-chrome","google-chrome-stable","chromium","chromium-browser"]){
  if(!name)continue;
  if(name.startsWith("/")&&fs.existsSync(name))return name;
  const found=spawnSync("which",[name],{encoding:"utf8"});
  if(found.status===0)return found.stdout.trim();
 }
 throw Error("Chrome/Chromium not found on CI runner");
}
function certs(){
 const p=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1",
  "-keyout",key,"-out",cert,"-subj","/CN=www.udemy.com"],{encoding:"utf8"});
 if(p.status!==0)throw Error("Could not create local-only HTTPS fixture cert: "+p.stderr.slice(-400));
}
function timeout(ms,reason){
 return new Promise((_,reject)=>setTimeout(()=>reject(Error(reason)),ms));
}
async function until(fn,label,ms=12000){
 const started=Date.now();let latest;
 while(Date.now()-started<ms){
  try{const result=await fn();if(result)return result;latest=result}catch(e){latest=e}
  await pause(200);
 }
 throw Error("Timeout waiting for "+label+"; last="+String(latest));
}
function fixtureHTML(){
 return [
 '<!doctype html><html><head><meta charset="utf-8"><title>Local fixture lesson 1</title></head><body>',
 '<main><h1 data-purpose="lecture-title">Synthetic lesson one</h1>',
 '<div id="player-wrapper" style="width:800px;height:480px;background:#222">',
 '<video muted playsinline controls style="display:block;width:640px;height:360px"></video>',
 '<div data-purpose="captions-display">Synthetic English caption</div>',
 '</div></main></body></html>'
 ].join("");
}
function openCDP(socketURL){
 const ws=new WebSocket(socketURL);
 const outstanding=new Map(),events=[];
 let next=1;
 ws.addEventListener("message",ev=>{
  const item=JSON.parse(typeof ev.data==="string"?ev.data:String(ev.data));
  if(!item.id&&["Runtime.executionContextCreated","Runtime.executionContextDestroyed","Runtime.exceptionThrown","Log.entryAdded","Runtime.consoleAPICalled","Page.frameNavigated"].includes(item.method))events.push(item);
  if(item.id&&outstanding.has(item.id)){
   const {resolve,reject}=outstanding.get(item.id);outstanding.delete(item.id);
   if(item.error)reject(Error(JSON.stringify(item.error)));
   else resolve(item.result||{});
  }
 });
 function call(method,params={}){
  const id=next++;
  const done=new Promise((resolve,reject)=>outstanding.set(id,{resolve,reject}));
  ws.send(JSON.stringify({id,method,params}));
  return Promise.race([done,timeout(12000,"CDP call timed out: "+method)]);
 }
 return {ws,events,ready:new Promise((resolve,reject)=>{
  ws.addEventListener("open",resolve,{once:true});
  ws.addEventListener("error",reject,{once:true});
 }),call,close:()=>ws.close()};
}
async function main(){
 certs();
 const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
  const html=fixtureHTML();
  res.writeHead(200,{"content-type":"text/html; charset=utf-8","content-length":Buffer.byteLength(html),"cache-control":"no-store"});
  res.end(html);
 });
 launched.push(()=>new Promise(resolve=>server.close(()=>resolve())));
 await new Promise((resolve,reject)=>server.listen(0,"127.0.0.1",err=>err?reject(err):resolve()));
 const port=server.address().port;
 const lessonURL="https://www.udemy.com:"+port+"/course/local-fixture/learn/lecture-1";
 const chrome=spawn(chromePath(),[
  "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--disable-background-networking",
  "--no-first-run","--no-default-browser-check","--disable-component-update",
  "--ignore-certificate-errors","--no-proxy-server","--remote-allow-origins=*",
  "--host-resolver-rules=MAP www.udemy.com 127.0.0.1",
  "--disable-extensions-except="+ext,"--load-extension="+ext,
  "--user-data-dir="+profile,"--remote-debugging-port=0","about:blank"
 ],{stdio:["ignore","ignore","pipe"]});
 let stderr="";
 chrome.stderr.on("data",d=>{stderr+=String(d);if(stderr.length>25000)stderr=stderr.slice(-20000)});
 launched.push(async()=>{
  if(chrome.exitCode!==null||chrome.signalCode)return;
  const exited=new Promise(resolve=>chrome.once('exit',resolve));
  try{chrome.kill('SIGKILL')}catch{}
  await Promise.race([exited,pause(2500)]);
 });
 const portFile=path.join(profile,"DevToolsActivePort");
 const portContent=await until(()=>fs.existsSync(portFile)&&fs.readFileSync(portFile,"utf8").trim(),"DevToolsActivePort",15000);
 const debugPort=Number(portContent.split("\n")[0]);
 assert.ok(debugPort>0);
 const result=await fetch("http://127.0.0.1:"+debugPort+"/json/new?"+encodeURIComponent(lessonURL),{method:"PUT"});
 assert.equal(result.status,200);
 const tab=await result.json();
 const cdp=openCDP(tab.webSocketDebuggerUrl);
 await cdp.ready;
 launched.push(()=>cdp.close());
 await cdp.call("Page.enable");
 await cdp.call("Runtime.enable");
 await cdp.call("Log.enable");
 async function evaluate(expression,gesture=false){
  const ans=await cdp.call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,userGesture:gesture});
  if(ans.exceptionDetails)throw Error("Browser JS error: "+JSON.stringify(ans.exceptionDetails).slice(0,750));
  return ans.result?.value;
 }
 const panelId="bgct-candidate-panel",captionId="bgct-candidate-caption";
 try{
  await until(async()=>await evaluate("Boolean(document.getElementById("+JSON.stringify(panelId)+"))"),"actual MV3 injection",15000);
 }catch(e){
  const page=await evaluate("({url:location.href,title:document.title,body:document.body?.innerText?.slice(0,900),video:document.querySelectorAll('video').length})").catch(err=>({error:String(err)}));
  const targets=await cdp.call("Target.getTargets").catch(err=>({error:String(err)}));
  console.error("CHROMIUM DEBUG PAGE:",JSON.stringify(page));
  console.error("CHROMIUM DEBUG TARGETS:",JSON.stringify(targets?.targetInfos?.map(x=>({type:x.type,url:x.url,title:x.title})).slice(0,18)));
  console.error("CHROMIUM DEBUG EVENTS:",JSON.stringify(cdp.events.slice(-15)).slice(0,5000));
  console.error("CHROMIUM STDERR:",stderr.slice(-2600));
  throw e;
 }
 assert.equal(await evaluate("document.querySelector('#"+panelId+" .bgct-subtitle').textContent"),
  "INTERNAL CANDIDATE • NOT RELEASED");
 const first=await evaluate("({url:location.href,video:document.querySelectorAll('video').length,panel:!!document.getElementById('"+panelId+"')})");
 assert.ok(first.url.includes("/course/local-fixture/learn/"));
 assert.equal(first.video,1);
 assert.equal(first.panel,true);
 // Switch target to same language. This verifies the real content script, chrome.storage
 // listeners, DOM caption extraction, model bypass, and actual browser rendering.
 await evaluate("(()=>{const s=document.querySelector('#bgct-candidate-target');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Synthetic English caption'"),"same-language rendered caption",12000);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').hidden"),false);
 const sourceText=await evaluate("document.getElementById('"+captionId+"').textContent");
 assert.equal(sourceText,"Synthetic English caption");

 // Seeking and ended video events must immediately clear stale subtitles,
 // rather than waiting for the periodic 700ms poll to catch a DOM update.
 assert.equal(await evaluate("(()=>{const v=document.querySelector('video');v.dispatchEvent(new Event('seeking'));return document.getElementById('"+captionId+"').hidden})()"),true,"Seeking must clear previous subtitle immediately");
 await evaluate("document.querySelector('video').dispatchEvent(new Event('seeked'))");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Synthetic English caption'"),"subtitle restored after seeking",4000);
 assert.equal(await evaluate("(()=>{document.querySelector('video').dispatchEvent(new Event('ended'));return document.getElementById('"+captionId+"').hidden})()"),true,"End of video must clear subtitle immediately");
 await pause(950);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').hidden"),true,"Polling must not bring back ended-video caption");
 await evaluate("document.querySelector('video').dispatchEvent(new Event('play'))");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Synthetic English caption'"),"captions resume on playback",4000);
 // The DOM captions container also drives event-based updates.
 await evaluate("document.querySelector('[data-purpose=\"captions-display\"]').textContent='Event-driven English cue'");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Event-driven English cue'"),"DOM MutationObserver caption update",4000);
 await evaluate("document.querySelector('[data-purpose=\"captions-display\"]').textContent='Synthetic English caption'");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Synthetic English caption'"),"restore fixture cue",4000);


 // In a real browser, language changes must update the in-page controls without reloading.
 await evaluate("(()=>{const e=document.getElementById('bgct-candidate-ui');e.value='pt_BR';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await evaluate("document.querySelector('label[for=\"bgct-candidate-ui\"]')?.textContent==='Idioma da interface'"),"PT-BR controls",6000);
 await evaluate("(()=>{const e=document.getElementById('bgct-candidate-ui');e.value='es';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await evaluate("document.querySelector('label[for=\"bgct-candidate-ui\"]')?.textContent==='Idioma de la interfaz'"),"ES controls",6000);
 await evaluate("(()=>{const e=document.getElementById('bgct-candidate-ui');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await evaluate("document.querySelector('label[for=\"bgct-candidate-ui\"]')?.textContent==='Interface language'"),"EN controls",6000);
 // Fullscreen relocation is checked when supported by the headless build.
 const isFullscreenEnabled=await evaluate("document.fullscreenEnabled");
 if(isFullscreenEnabled){
  const entered=await evaluate("(async()=>{try{await document.getElementById('player-wrapper').requestFullscreen();return 'ok'}catch(e){return e.name}})()",true);
  if(entered==="ok"){
   await until(async()=>await evaluate("document.fullscreenElement!==null&&document.getElementById('bgct-candidate-panel').parentNode===document.fullscreenElement"),"fullscreen overlay relocation",6000);
   assert.equal(await evaluate("document.getElementById('bgct-candidate-caption').parentNode===document.fullscreenElement"),true);
   await evaluate("document.exitFullscreen()");
   await until(async()=>await evaluate("document.fullscreenElement===null&&document.getElementById('bgct-candidate-panel').parentNode===document.body"),"exit fullscreen overlay relocation",6000);
  }else console.log("BGCT FULLSCREEN CHECK SKIPPED: headless build rejected requestFullscreen ("+entered+")");
 }else console.log("BGCT FULLSCREEN CHECK SKIPPED: fullscreen API disabled in headless runner");


 // Exercise the real MV3 isolated-world code path, but inject a deterministic
 // test Translator. This does NOT test native model support or contact Udemy.
 const extContext=await until(async()=>{
  const ids=[...new Set(cdp.events.filter(e=>e.method==="Runtime.executionContextCreated").map(e=>e.params?.context?.id).filter(Number.isInteger))];
  for(const id of ids){
   try{
    const v=await cdp.call("Runtime.evaluate",{expression:"typeof globalThis.BGCT_STAGING_SESSION",contextId:id,returnByValue:true});
    if(v.result?.value==="object")return id;
   }catch{}
  }
  return null;
 },"MV3 isolated-world execution context",12000);
 async function isolated(expression){
  const result=await cdp.call("Runtime.evaluate",{expression,contextId:extContext,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error("Extension world JS error: "+JSON.stringify(result.exceptionDetails).slice(0,700));
  return result.result?.value;
 }
 const nativeProbe=await isolated("({type:typeof globalThis.Translator,availability:typeof globalThis.Translator?.availability,create:typeof globalThis.Translator?.create})");
 console.log("BGCT NATIVE API PASSIVE PROBE (no model download): "+JSON.stringify(nativeProbe));
 if(nativeProbe.availability==="function"){
  const nativePairStatus=await isolated("(async()=>{try{return await globalThis.Translator.availability({sourceLanguage:'en',targetLanguage:'pt'})}catch(e){return 'error:'+String(e?.name||'unknown')}})()");
  console.log("BGCT NATIVE EN->PT AVAILABILITY ONLY (no model create/download): "+JSON.stringify(nativePairStatus));
  assert.equal(typeof nativePairStatus,"string","Native availability should return a status string");
 }
 const mockScript=String.raw`
 (()=>{
  const mock={availability:[],created:0,destroyed:0,requests:[],setupAttempts:0,failSetupOnce:true};
  globalThis.__BGCT_TEST_MOCK=mock;
  globalThis.Translator={
   availability:async pair=>{mock.availability.push(pair);return "available"},
   create(options){
    mock.setupAttempts++;
    if(mock.failSetupOnce){mock.failSetupOnce=false;throw new Error("synthetic setup failure")}
    mock.created++;
    return Promise.resolve({
     translate(text,{signal}={}){
      return new Promise((resolve,reject)=>{
       mock.requests.push({text,resolve,reject,signal});
       signal?.addEventListener("abort",()=>reject(new Error("test request aborted")),{once:true});
      });
     },
     destroy(){mock.destroyed++}
    });
   }
  };
  return true;
 })()
 `;
 assert.equal(await isolated(mockScript),true);
 // Trigger a different-language pair on the real panel and wait for availability.
 await evaluate("(()=>{const e=document.getElementById('bgct-candidate-target');e.value='pt';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.availability.length>0"),"browser on-device adapter availability probe");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.created"),0,"Passive lesson load must never download a model");
 await until(async()=>await evaluate("document.querySelector('#bgct-candidate-panel .bgct-state').textContent==='Click to start translation'"),"visible manual model activation");
 // The first gesture intentionally fails creating a model: user must be able
 // to retry with another genuine click, without a new availability probe.
 await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').click()",true);
 await until(async()=>await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').textContent==='Retry model activation'"),"manual model setup retry label");
 assert.equal(await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').disabled"),false);
 assert.equal(await evaluate("document.querySelector('#bgct-candidate-panel .bgct-state').textContent"),"Could not start the translation model. Try again.");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.created"),0);
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.setupAttempts"),1);
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.availability.length"),1);
 await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').click()",true);
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.created===1"),"model created after trusted retry");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.setupAttempts"),2);
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.requests.length>=1"),"first model translation request");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.requests[0].text"),"Synthetic English caption");

 // A lecture title or marketing query may update without changing the lesson.
 // This must NOT cancel a translation that is already in progress.
 await evaluate("(()=>{document.querySelector('[data-purpose=\"lecture-title\"]').textContent='Title changed without navigation';history.replaceState({},'','/course/local-fixture/learn/lecture-1?utm_source=fixture');return true})()");
 await pause(900);
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.requests[0].signal.aborted"),false,"Same lecture URL should not abort a translation due to title/UTM changes");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.requests.length"),1,"Same lecture URL must not duplicate a translation request");

 assert.equal(await evaluate("document.getElementById('"+captionId+"').textContent"),"","No flash of untranslated original sentence");
 await evaluate("document.querySelector('[data-purpose=\"captions-display\"]').textContent='Fast second sentence'");
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.requests.length>=2"),"second translated caption request");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.requests[0].signal.aborted"),true,"Real browser path cancels the obsolete cue");
 await isolated("globalThis.__BGCT_TEST_MOCK.requests[1].resolve('Segunda frase traduzida');true");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Segunda frase traduzida'"),"translated subtitle overlay");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.created"),1);

 // Deliberately provoke an empty result in the actual extension UI.
 await evaluate("document.querySelector('[data-purpose=\"captions-display\"]').textContent='Temporary translation failure'");
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.requests.length>=3"),"third translation request");
 await isolated("globalThis.__BGCT_TEST_MOCK.requests[2].resolve('   ');true");
 await until(async()=>await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').textContent==='Retry translation'"),"localized retry button");
 assert.equal(await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').disabled"),false);
 assert.equal(await evaluate("document.querySelector('#bgct-candidate-panel .bgct-state').textContent"),"The browser returned no translated text. Try again.");
 assert.equal(await evaluate("document.getElementById('"+captionId+"').hidden"),true);
 await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').click()",true);
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.requests.length>=4"),"retry of exact same caption");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.created"),1,"Retry reuses the loaded browser model");
 await isolated("globalThis.__BGCT_TEST_MOCK.requests[3].resolve('Tradução recuperada');true");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Tradução recuperada'"),"recovered translation on same cue");
 console.log("BGCT REAL BROWSER RETRY PASS — blank model result, localized error, manual retry, same model and recovered overlay.");

 console.log("BGCT REAL BROWSER TRANSLATION CONTRACT PASS — MV3 isolated world, simulated Translator, manual setup recovery, cue cancellation, translated overlay.");
 // Restore original-language mode for SPA/fullscreen and route-cleanup checks.
 await evaluate("(()=>{const e=document.getElementById('bgct-candidate-target');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Temporary translation failure'"),"return to same-language passthrough");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.destroyed"),1,"Changing language pair must destroy the old session");

 // A SPA transition can update the lecture URL before updating the player's
 // caption DOM. The caption from lecture 1 must never be assigned to lecture 2.
 await evaluate("(()=>{history.pushState({},'','/course/local-fixture/learn/lecture-2');document.querySelector('[data-purpose=\"lecture-title\"]').textContent='Synthetic lesson two';return true})()");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').hidden"),"quarantine old caption at lecture transition",4000);
 await pause(1000);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').hidden"),true,"Old lecture caption must stay hidden until source updates");
 assert.equal(await evaluate("document.getElementById('"+captionId+"').textContent"),"","Old caption text must not remain in overlay");
 await evaluate("document.querySelector('[data-purpose=\"captions-display\"]').textContent='Second lesson text'");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Second lesson text'"),"new lecture subtitle after DOM update",10000);

 // Repeating the exact phrase in the NEXT lesson must not leave the overlay
 // blocked forever. Only a new cuechange/DOM mutation releases the quarantine.
 await evaluate("history.pushState({},'','/course/local-fixture/learn/lecture-3')");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').hidden"),"quarantine repeated phrase on next lesson",4000);
 await pause(900);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').hidden"),true,"No source event: old caption remains blocked");
 await evaluate("document.querySelector('[data-purpose=\"captions-display\"]').textContent='Second lesson text'");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Second lesson text'"),"same legitimate phrase after fresh DOM cue",5000);
 console.log("BGCT SAME-PHRASE LECTURE PASS — old cue held until source event; identical new cue then rendered.");

 // Navigation outside supported route must clear captions and hide the panel.
 await evaluate("history.pushState({},'','/my-courses')");
 await until(async()=>await evaluate("document.getElementById('"+panelId+"').hidden&&document.getElementById('"+captionId+"').hidden"),"SPA departure cleanup",10000);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').textContent"),"");
 // Extension remains mounted and the panel is restored after returning to a lesson.
 await evaluate("history.pushState({},'','/course/local-fixture/learn/lecture-4')");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Second lesson text'"),"reentered course",10000);
 assert.equal(await evaluate("document.getElementById('"+panelId+"').hidden"),false,"Returning to a supported lesson must restore the panel");
 console.log("BGCT REAL CHROMIUM MV3 SMOKE PASS — installed unpacked in disposable profile, HTTPS synthetic lesson, scoped injection, DOM captions, same-language passthrough, PT-BR/EN/ES controls, fullscreen where available, lecture SPA, route cleanup.");
 console.log("SCOPE: Synthetic browser fixture only. NOT a real Udemy course or original 0.6.0 extension.");

 // Test the actual extension popup page in Chrome rather than relying only on JS syntax checks.
 const extensionId=await isolated("chrome.runtime.id");
 assert.match(extensionId,/^[a-p]{32}$/,"MV3 extension ID must be available in isolated content world");
 const popupURL="chrome-extension://"+extensionId+"/popup.html";
 const pageResponse=await fetch("http://127.0.0.1:"+debugPort+"/json/new?"+encodeURIComponent(popupURL),{method:"PUT"});
 assert.equal(pageResponse.status,200,"Opening the packaged popup should succeed");
 const popupTab=await pageResponse.json();
 const popupCDP=openCDP(popupTab.webSocketDebuggerUrl);
 await popupCDP.ready;
 launched.push(()=>popupCDP.close());
 await popupCDP.call("Page.enable");
 await popupCDP.call("Runtime.enable");
 async function popupEval(expression){
  const result=await popupCDP.call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error("Popup JS error: "+JSON.stringify(result.exceptionDetails).slice(0,800));
  return result.result?.value;
 }
 await until(async()=>await popupEval("document.getElementById('open')?.textContent?.length>0"),"actual popup startup",8000);
 assert.equal(await popupEval("location.protocol"),"chrome-extension:","Popup must run as a real extension page");
 assert.equal(await popupEval("document.querySelector('header strong').textContent"),"BlackGold Course Translator");
 assert.equal(await popupEval("document.getElementById('ui-label').textContent"),"Interface language");
 await popupEval("(()=>{const e=document.getElementById('ui');e.value='es';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await popupEval("document.getElementById('ui-label').textContent==='Idioma de la interfaz'"),"Spanish popup controls",6000);
 await until(async()=>await popupEval("(async()=>{const v=await chrome.storage.local.get('bgctUiLocale');return v.bgctUiLocale==='es'})()"),"stored Spanish interface locale",6000);
 await popupEval("(()=>{const e=document.getElementById('ui');e.value='pt_BR';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await popupEval("document.getElementById('ui-label').textContent==='Idioma da interface'"),"Brazilian Portuguese popup controls",6000);
 await popupEval("(()=>{const e=document.getElementById('ui');e.value='en';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await popupEval("document.getElementById('ui-label').textContent==='Interface language'"),"English popup controls",6000);
 // Verify popup->content messaging using the real MV3 runtime. Find the fixture lesson tab
 // by its responding content script; no URL/title access or broad tabs permission required.
 const lessonTabId=await popupEval("(async()=>{for(const t of await chrome.tabs.query({})){try{const x=await chrome.tabs.sendMessage(t.id,{channel:'bgct-candidate',type:'status'});if(x?.candidate)return t.id}catch{}}return null})()");
 assert.ok(Number.isInteger(lessonTabId)&&lessonTabId>0,"Popup must locate the installed candidate's tab");
 await evaluate("document.getElementById('bgct-candidate-panel').hidden=true");
 const openResult=await popupEval("chrome.tabs.sendMessage("+lessonTabId+",{channel:'bgct-candidate',type:'open'})");
 assert.equal(openResult?.ok,true,"Popup-to-content message must reopen the panel");
 await until(async()=>await evaluate("!document.getElementById('bgct-candidate-panel').hidden"),"panel reopened by popup runtime message",6000);
 console.log("BGCT REAL CHROME POPUP PASS — actual extension page, PT-BR/EN/ES labels, chrome.storage persistence, tab messaging and panel reopening.");

 // Closing the actual panel must discard private model and subtitle memory.
 await evaluate("(()=>{const e=document.getElementById('bgct-candidate-target');e.value='pt';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.availability.length>=2"),"availability on second translated session",7000);
 await evaluate("document.querySelector('#bgct-candidate-panel .bgct-start').click()",true);
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.created===2"),"second model creation before closing",7000);
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.requests.length>=5"),"last pending translation before closing",7000);
 const callsBeforeClose=await isolated("globalThis.__BGCT_TEST_MOCK.requests.length");
 await evaluate("document.querySelector('#bgct-candidate-panel .bgct-actions button:last-child').click()",true);
 assert.equal(await evaluate("document.getElementById('bgct-candidate-panel').hidden"),true);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').hidden"),true);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').textContent"),"");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.destroyed"),2,"Closing must release model");
 const statusAfterClose=await popupEval("chrome.tabs.sendMessage("+lessonTabId+",{channel:'bgct-candidate',type:'status'})");
 assert.equal(statusAfterClose?.inactive,true);
 await evaluate("document.querySelector('[data-purpose=\"captions-display\"]').textContent='Caption while panel closed'");
 await pause(950);
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.requests.length"),callsBeforeClose,"Closed panel must not continue translating");
 assert.equal(await evaluate("document.getElementById('bgct-candidate-panel').hidden"),true);
 const openAfterClose=await popupEval("chrome.tabs.sendMessage("+lessonTabId+",{channel:'bgct-candidate',type:'open'})");
 assert.equal(openAfterClose?.ok,true);
 await until(async()=>await evaluate("!document.getElementById('bgct-candidate-panel').hidden"),"manual reopening after privacy cleanup");
 await until(async()=>await isolated("globalThis.__BGCT_TEST_MOCK.availability.length>=3"),"fresh passive availability after reopening");
 assert.equal(await isolated("globalThis.__BGCT_TEST_MOCK.created"),2,"No model creation on popup reopening");
 assert.equal(await evaluate("document.getElementById('"+captionId+"').hidden"),true,"Model must wait for gesture after reopening");
 console.log("BGCT CHROME CLOSE/REOPEN PASS — model destroyed, captions cleared, hidden session paused, explicit reopening without automatic download.");


}
try{await main()}catch(e){
 console.error("BGCT CHROMIUM SMOKE FAILED:",e?.stack||String(e));
 process.exitCode=1;
}finally{
 for(const close of launched.reverse())try{await close()}catch{}
 try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:15,retryDelay:200})}
 catch(e){console.error("Fixture cleanup warning:",String(e))}
}
