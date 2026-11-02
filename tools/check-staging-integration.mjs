import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
// Integration contract for the two real staging modules, but NOT for Udemy DOM or installed extension.
const root=path.resolve(import.meta.dirname,"..");
const context={AbortController};vm.createContext(context);
for(const file of ["translator-api-adapter.js","caption-coordinator.js"]){
 vm.runInContext(fs.readFileSync(path.join(root,"extension-staging",file),"utf8"),context,{filename:file});
}
const makeRuntime=context.BGCT_STAGING_TRANSLATOR.makeRuntime;
const makeCoordinator=context.BGCT_STAGING_CAPTIONS.makeCoordinator;
const queue=[],views=[],calls={create:0,translate:0,destroy:0},states=[];
const translator={
 availability:async()=> "available",
 create(){
  calls.create++;
  return Promise.resolve({
   translate(text,options={}){
    calls.translate++;
    return new Promise((resolve,reject)=>{
     const item={text,resolve,reject,signal:options.signal};
     queue.push(item);
     options.signal?.addEventListener("abort",()=>reject(new Error("aborted")),{once:true});
    });
   },
   destroy(){calls.destroy++}
  });
 }
};
const runtime=makeRuntime({TranslatorCtor:translator,onState:(name)=>states.push(name)});
const captions=makeCoordinator({runtime,onRender:view=>views.push(view)});
const contextA={courseId:"example-course",lectureId:"one",sourceLanguage:"en",targetLanguage:"pt"};
assert.equal(captions.setContext(contextA),true);
assert.equal((await runtime.inspect("en","pt")).code,"needs-activation");
assert.equal((await runtime.startFromGesture()).code,"ready");
const first=captions.showCue({cueId:"1",text:"First sentence",startMs:0,endMs:999});
assert.equal(views.at(-1).state,"pending");
assert.equal(views.at(-1).text,"");
const second=captions.showCue({cueId:"2",text:"Second sentence",startMs:1000,endMs:2000});
assert.equal(queue.length,2);
assert.equal(queue[0].signal.aborted,true);
assert.equal((await first).code,"stale");
queue[1].resolve("Segunda frase");
assert.equal((await second).text,"Segunda frase");
assert.equal(views.at(-1).text,"Segunda frase");
const beforeCache=calls.translate;
assert.equal((await captions.showCue({cueId:"2",text:"Second sentence",startMs:1000,endMs:2000})).code,"translated");
assert.equal(calls.translate,beforeCache);
const third=captions.showCue({cueId:"3",text:"Third sentence",startMs:2000,endMs:3000});
captions.setContext({...contextA,lectureId:"two"});
assert.equal(queue[2].signal.aborted,true,"Changing lecture cancels obsolete translation");
assert.equal((await third).code,"stale");
assert.equal(views.at(-1).state,"idle");
assert.equal(runtime.snapshot().ready,true,"Same language pair retains model");
const newLecture=captions.showCue({cueId:"3",text:"Third sentence",startMs:2000,endMs:3000});
queue[3].resolve("Terceira frase");
assert.equal((await newLecture).code,"translated");
captions.setContext({...contextA,lectureId:"two",targetLanguage:"es"});
assert.equal(calls.destroy,1,"Changing language pair releases old model");
assert.equal(runtime.snapshot().ready,false);
assert.equal(captions.snapshot().cacheSize,0);
assert.equal((await runtime.inspect("en","es")).code,"needs-activation");
assert.equal((await runtime.startFromGesture()).code,"ready");
const otherPair=captions.showCue({cueId:"3",text:"Third sentence",startMs:2000,endMs:3000});
queue[4].resolve("Tercera frase");
await otherPair;
assert.equal(views.at(-1).text,"Tercera frase");
captions.close();
assert.equal(calls.destroy,2,"Closing releases model resources");
assert.equal(captions.snapshot().cacheSize,0);
assert.equal(captions.snapshot().hasContext,false);
assert.ok(states.includes("translating"));
console.log("BGCT END-TO-END STAGING PASS: active model, caption interruption, lesson switch, language switch, cache and privacy cleanup.");
