import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const file=path.join(import.meta.dirname,"../extension-staging/translator-api-adapter.js");
const code=fs.readFileSync(file,"utf8");
const sandbox={};vm.createContext(sandbox);vm.runInContext(code,sandbox);
const make=sandbox.BGCT_STAGING_TRANSLATOR.makeRuntime;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function sampleCtor(availability="available",extra={}){
 const events={};let creates=0,destroyed=0;
 const T={
  async availability(){return availability},
  create(options){
   creates++;
   const observer={addEventListener(type,fn){events[type]=fn}};
   options.monitor(observer);
   if(extra.create) return extra.create(options);
   return Promise.resolve({async translate(text){return text.toUpperCase()},destroy(){destroyed++}});
  }
 };
 return {T,events,get creates(){return creates},get destroyed(){return destroyed}};
}
const states=[];
const missing=make({TranslatorCtor:null,onState:s=>states.push(s)});
assert.equal(missing.supported(),false);
assert.equal((await missing.inspect("en","pt")).code,"api-unavailable");
assert.equal(missing.snapshot().state,"api-unavailable");
assert.equal((await missing.startFromGesture()).code,"not-inspected");
const unavailable=make({TranslatorCtor:sampleCtor("unavailable").T});
assert.equal((await unavailable.inspect("en","es")).code,"pair-unavailable");
assert.equal((await unavailable.inspect("garbage-code-too-long","es")).code,"invalid-language");
assert.equal((await unavailable.inspect("en","en")).code,"same-language");
const creation=sampleCtor("downloadable"),progress=[],statuses=[];
const runtime=make({TranslatorCtor:creation.T,onState:(s,d)=>statuses.push({s,d}),onProgress:p=>progress.push(p)});
const info=await runtime.inspect("en","pt");
assert.equal(info.availability,"downloadable");
assert.equal(info.code,"needs-activation");
assert.equal(creation.creates,0,"Model must never download during passive availability probe");
const p=runtime.startFromGesture();
assert.equal(creation.creates,1,"Translator.create must run before first await in gesture callback");
creation.events.downloadprogress({loaded:.425});
assert.equal(progress[0],43);
creation.events.downloadprogress({loaded:null});
assert.equal(progress.length,1,"Missing progress value must not be interpreted as zero");
assert.equal((await p).code,"ready");
assert.equal(runtime.snapshot().ready,true);
creation.events.downloadprogress({loaded:.85});
assert.equal(progress.length,1,"Late progress after ready must be ignored");
assert.equal(runtime.snapshot().state,"ready","Ready must not revert to downloading");
assert.equal((await runtime.translate("hello")).text,"HELLO");
assert.equal(runtime.snapshot().state,"ready");
assert.equal(runtime.snapshot().pending,false);
assert.equal((await runtime.translate("  ")).code,"empty");
runtime.reset();
assert.equal(creation.destroyed,1);
assert.equal(runtime.snapshot().ready,false);
assert.equal((await runtime.translate("hello")).code,"not-ready");
const immediate=sampleCtor("available");
const rt2=make({TranslatorCtor:immediate.T});
assert.equal((await rt2.inspect("en","es")).availability,"available");
assert.equal((await rt2.startFromGesture()).code,"ready");
assert.equal(immediate.creates,1);
let resolveCreate;let destroyedStale=0;
const late=sampleCtor("downloadable",{create:()=>new Promise(resolve=>{resolveCreate=resolve})});
const rt3=make({TranslatorCtor:late.T});
await rt3.inspect("en","pt");
const outdated=rt3.startFromGesture();
rt3.reset();
resolveCreate({async translate(t){return t},destroy(){destroyedStale++}});
assert.equal((await outdated).code,"stale");
assert.equal(destroyedStale,1,"Stale session must be released");
assert.equal(rt3.snapshot().state,"idle");
let resolveTranslation;
const deferred=sampleCtor("available",{create:()=>Promise.resolve({translate:()=>new Promise(resolve=>{resolveTranslation=resolve}),destroy(){}})});
const rt4=make({TranslatorCtor:deferred.T});
await rt4.inspect("en","es");
await rt4.startFromGesture();
const pending=rt4.translate("before");
rt4.reset();
resolveTranslation("old translation");
assert.equal((await pending).code,"stale","Old subtitles must not overwrite new lesson state");
const throwing=make({TranslatorCtor:{availability:async()=>{throw Error("blocked")},create:()=>{throw Error("unreachable")}}});
assert.equal((await throwing.inspect("en","es")).code,"availability-failed");
const rejected=make({TranslatorCtor:{availability:async()=>"available",create(){throw Error("blocked")}}});
await rejected.inspect("en","pt");
assert.equal((await rejected.startFromGesture()).code,"create-failed");
assert.equal(rejected.snapshot().state,"error");
const wrong=make({TranslatorCtor:{availability:async()=>"undefined",create(){return Promise.resolve({translate(){}})}}});
assert.equal((await wrong.inspect("en","pt")).code,"unknown-availability");
assert.equal(runtime.snapshot().state,"idle");

let resolveOld,resolveNew;
const reordering=make({TranslatorCtor:{
  availability:async()=>"available",
  create:()=>Promise.resolve({
    translate(text){return new Promise(resolve=>{if(text==="old")resolveOld=resolve;else resolveNew=resolve})},
    destroy(){}
  })
}});
await reordering.inspect("en","pt");
assert.equal((await reordering.startFromGesture()).code,"ready");
const oldCaption=reordering.translate("old");
const newCaption=reordering.translate("new");
resolveNew("NOVA LEGENDA");
assert.equal((await newCaption).text,"NOVA LEGENDA");
resolveOld("TEXTO ATRASADO");
assert.equal((await oldCaption).code,"stale","Earlier caption must not overwrite newer caption in same lesson");
assert.equal(reordering.snapshot().state,"ready");
let rejectEarlier,resolveLater;
const concurrentErrors=make({TranslatorCtor:{
 availability:async()=>"available",
 create:()=>Promise.resolve({
  translate(text){return new Promise((resolve,reject)=>{if(text==="first")rejectEarlier=reject;else resolveLater=resolve})},
  destroy(){}
 })
}});
await concurrentErrors.inspect("en","es");
await concurrentErrors.startFromGesture();
const firstCaption=concurrentErrors.translate("first");
const secondCaption=concurrentErrors.translate("second");
resolveLater("SEGUNDO");
assert.equal((await secondCaption).code,"translated");
rejectEarlier(new Error("obsolete network-free translator result"));
assert.equal((await firstCaption).code,"stale","Old caption failure must not make current session error");
assert.equal(concurrentErrors.snapshot().state,"ready");
const blank=make({TranslatorCtor:sampleCtor("available").T});
await blank.inspect("en","es");
await blank.startFromGesture();
assert.equal((await blank.translate(" ")).code,"empty");
assert.equal(blank.snapshot().state,"ready","Blank captions must not strand UI in translating");
let resolveSlow;
const blankSupersedes=make({TranslatorCtor:{
  availability:async()=>"available",
  create:()=>Promise.resolve({translate:()=>new Promise(resolve=>{resolveSlow=resolve}),destroy(){}})
}});
await blankSupersedes.inspect("en","pt");
await blankSupersedes.startFromGesture();
const captionBeforeBlank=blankSupersedes.translate("old");
assert.equal((await blankSupersedes.translate(" ")).code,"empty");
resolveSlow("stale text");
assert.equal((await captionBeforeBlank).code,"stale","Blank caption clears pending stale translation");
let finishFirstInspect;
const inspected=make({TranslatorCtor:{
 availability:({targetLanguage})=>targetLanguage==="pt"?
  new Promise(resolve=>{finishFirstInspect=resolve}):Promise.resolve("available"),
 create:()=>Promise.resolve({translate:async()=>"",destroy(){}})
}});
const earlierInspection=inspected.inspect("en","pt");
assert.equal((await inspected.inspect("en","es")).code,"needs-activation");
finishFirstInspect("downloadable");
assert.equal((await earlierInspection).code,"stale","An older capability check must not replace latest language pair");
assert.equal(inspected.snapshot().pending,true);

console.log("BGCT Translator API ADAPTER PASS — availability gates, user gesture, progress, no auto download, same-lesson caption races, stale session/translation, late progress, cleanup and error states.");
