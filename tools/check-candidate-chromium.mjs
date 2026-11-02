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
 const outstanding=new Map();
 let next=1;
 ws.addEventListener("message",ev=>{
  const item=JSON.parse(typeof ev.data==="string"?ev.data:String(ev.data));
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
 return {ws,ready:new Promise((resolve,reject)=>{
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
 launched.push(()=>{if(!chrome.killed)chrome.kill("SIGKILL")});
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
 async function evaluate(expression,gesture=false){
  const ans=await cdp.call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,userGesture:gesture});
  if(ans.exceptionDetails)throw Error("Browser JS error: "+JSON.stringify(ans.exceptionDetails).slice(0,750));
  return ans.result?.value;
 }
 const panelId="bgct-candidate-panel",captionId="bgct-candidate-caption";
 await until(async()=>await evaluate("Boolean(document.getElementById('"+panelId+"'))"),"actual MV3 injection",15000);
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
 // SPA lecture navigation with same video must not continue showing the old caption.
 await evaluate("(()=>{document.querySelector('[data-purpose=\"captions-display\"]').textContent='Second lesson text';document.querySelector('[data-purpose=\"lecture-title\"]').textContent='Synthetic lesson two';history.pushState({},'','/course/local-fixture/learn/lecture-2');return true})()");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Second lesson text'"),"SPA lesson transition",10000);
 // Navigation outside supported route must clear captions and hide the panel.
 await evaluate("history.pushState({},'','/my-courses')");
 await until(async()=>await evaluate("document.getElementById('"+panelId+"').hidden&&document.getElementById('"+captionId+"').hidden"),"SPA departure cleanup",10000);
 assert.equal(await evaluate("document.getElementById('"+captionId+"').textContent"),"");
 // Extension remains mounted and can be restored after reentering a supported lesson.
 await evaluate("history.pushState({},'','/course/local-fixture/learn/lecture-3')");
 await until(async()=>await evaluate("document.getElementById('"+captionId+"').textContent==='Second lesson text'"),"reentered course",10000);
 console.log("BGCT REAL CHROMIUM MV3 SMOKE PASS — installed unpacked in disposable profile, HTTPS synthetic lesson, scoped injection, DOM captions, same-language passthrough, lecture SPA, route cleanup.");
 console.log("SCOPE: Synthetic browser fixture only. NOT a real Udemy course or original 0.6.0 extension.");
}
try{await main()}catch(e){
 console.error("BGCT CHROMIUM SMOKE FAILED:",e?.stack||String(e));
 process.exitCode=1;
}finally{
 for(const close of launched.reverse())try{await close()}catch{}
 fs.rmSync(tmp,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
