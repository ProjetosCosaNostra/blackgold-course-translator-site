import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const root=path.resolve(import.meta.dirname,".."),sandbox={AbortController};
vm.createContext(sandbox);
for(const name of ["translator-api-adapter.js","caption-coordinator.js","session-controller.js"])
 vm.runInContext(fs.readFileSync(path.join(root,"extension-staging",name),"utf8"),sandbox,{filename:name});
const make=sandbox.BGCT_STAGING_SESSION.makeSession;
const states=[],views=[],requests=[];
let created=0,destroyed=0,resolveAvailability;
const T={
 availability:({targetLanguage})=>targetLanguage==="pt"?new Promise(resolve=>{resolveAvailability=resolve}):Promise.resolve("available"),
 create(){created++;return Promise.resolve({
  translate(text,{signal}={}){return new Promise((resolve,reject)=>{
   requests.push({text,resolve,reject,signal});
   signal?.addEventListener("abort",()=>reject(Error("abort")),{once:true});
  })},
  destroy(){destroyed++}
 })}
};
const s=make({TranslatorCtor:T,onStatus:(x)=>states.push(x),onCaption:(v)=>views.push(v)});
const lesson={courseId:"course-A",lectureId:"lecture-1",sourceLanguage:"en",targetLanguage:"pt"};
const probe=s.setLesson(lesson);
assert.equal(created,0,"Availability must never initiate a model download");
assert.equal((await s.showCue({text:"Before click"})).code,"not-ready");
assert.equal(views.at(-1).text,"");
resolveAvailability("downloadable");
assert.equal((await probe).code,"needs-activation");
const activation=s.activateFromGesture();
assert.equal(created,1,"Create must occur immediately in user event");
assert.equal((await activation).code,"ready");
const a=s.showCue({cueId:"1",text:"One"}),b=s.showCue({cueId:"2",text:"Two"});
assert.equal(requests.length,2);
assert.equal(requests[0].signal.aborted,true);
assert.equal((await a).code,"stale");
requests[1].resolve("Dois");
assert.equal((await b).text,"Dois");
assert.equal(views.at(-1).text,"Dois");
assert.equal((await s.setLesson({...lesson,lectureId:"lecture-2"})).code,"ready");
assert.equal(created,1,"Changing lecture must reuse model");
const pending=s.showCue({cueId:"3",text:"Next lecture"});
assert.equal((await s.setLesson({...lesson,lectureId:"lecture-2",targetLanguage:"es"})).code,"needs-activation");
assert.equal(requests[2].signal.aborted,true);
assert.equal((await pending).code,"stale");
assert.equal(destroyed,1);
assert.equal(s.snapshot().cacheSize,0);
const activation2=s.activateFromGesture();
assert.equal(created,2);
assert.equal((await activation2).code,"ready");
const translated=s.showCue({cueId:"4",text:"Three"});
requests[3].resolve("Tres");
assert.equal((await translated).text,"Tres");
assert.equal((await s.setLesson(null)).code,"invalid-context");
assert.equal(s.snapshot().courseId,null);
assert.equal(s.snapshot().cacheSize,0);
assert.equal(s.snapshot().ready,false);
assert.equal((await s.showCue({text:"unsafe"})).code,"no-context");
let resumeProbe;
const delayed=make({TranslatorCtor:{
 availability:()=>new Promise(resolve=>{resumeProbe=resolve}),
 create(){throw Error("must not activate")}
}});
const waiting=delayed.setLesson(lesson);
delayed.close();
resumeProbe("available");
assert.equal((await waiting).code,"stale");
assert.equal((await delayed.activateFromGesture()).code,"closed");
assert.equal((await delayed.setLesson(lesson)).code,"closed");
assert.equal((await delayed.showCue({text:"hi"})).code,"closed");
s.close();
assert.equal(destroyed,2);
assert.equal(s.snapshot().closed,true);
assert.equal(s.snapshot().cacheSize,0);
assert.ok(states.includes("translating"));

let releaseModel;
let startedModels=0;
let cancelledModels=0;
const slowModel=make({TranslatorCtor:{
 availability:async()=>"downloadable",
 create(options){
  startedModels++;
  options.signal?.addEventListener("abort",()=>{cancelledModels++},{once:true});
  return new Promise(resolve=>{releaseModel=resolve});
 }
}});
const slowLesson={courseId:"course-slow",lectureId:"part-1",sourceLanguage:"en",targetLanguage:"pt"};
assert.equal((await slowModel.setLesson(slowLesson)).code,"needs-activation");
const modelStarting=slowModel.activateFromGesture();
assert.equal(startedModels,1);
assert.equal((await slowModel.setLesson({...slowLesson,lectureId:"part-2"})).code,"model-loading",
 "Same language pair must not restart a model downloading during lecture navigation");
assert.equal(startedModels,1);
assert.equal(cancelledModels,0);
releaseModel({async translate(t){return t},destroy(){}});
assert.equal((await modelStarting).code,"ready");
assert.equal(slowModel.snapshot().ready,true);
slowModel.close();
assert.equal(cancelledModels,1);


const alreadyTexts=[],sameCounts={availability:0,create:0,translate:0,destroy:0};
const same=make({TranslatorCtor:{
 availability:async()=>{sameCounts.availability++;return "available"},
 create(){sameCounts.create++;return Promise.resolve({translate:async t=>{sameCounts.translate++;return t},destroy(){sameCounts.destroy++}})}
},onCaption:frame=>alreadyTexts.push(frame)});
const sameLesson={courseId:"course-original",lectureId:"one",sourceLanguage:"en-US",targetLanguage:"EN"};
assert.equal((await same.setLesson(sameLesson)).code,"original-ready");
assert.equal(same.snapshot().originalMode,true);
assert.equal(same.snapshot().canRender,true);
assert.equal(same.snapshot().ready,false,"Passthrough is not a loaded translation model");
assert.equal((await same.activateFromGesture()).code,"original-ready");
assert.equal((await same.showCue({cueId:"1",text:"Already English"})).code,"original");
assert.equal(alreadyTexts.at(-1).text,"Already English");
assert.equal(alreadyTexts.at(-1).state,"original");
assert.equal((await same.setLesson({...sameLesson,lectureId:"two",sourceLanguage:"en_US"})).code,"original-ready");
assert.equal((await same.showCue({cueId:"2",text:"Same base language"})).text,"Same base language");
assert.equal(sameCounts.availability,0,"Matching languages must not probe model availability");
assert.equal(sameCounts.create,0,"Matching languages must not request model download");
assert.equal(sameCounts.translate,0,"Matching languages must not call translation API");
assert.equal((await same.setLesson({...sameLesson,lectureId:"three",sourceLanguage:"es",targetLanguage:"es-MX"})).code,"original-ready");
assert.equal((await same.showCue({cueId:"3",text:"Español original"})).code,"original");
assert.equal(sameCounts.availability,0);
same.close();
assert.equal(same.snapshot().originalMode,false);

console.log("BGCT SESSION CONTROLLER PASS: passive probe, trusted gesture, active cues, lesson reuse, language reset, cache clearing and safe close.");
