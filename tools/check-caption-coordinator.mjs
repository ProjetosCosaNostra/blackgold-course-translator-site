import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const source=fs.readFileSync(path.resolve(import.meta.dirname,"../extension-staging/caption-coordinator.js"),"utf8");
const sandbox={};vm.createContext(sandbox);vm.runInContext(source,sandbox);
const make=sandbox.BGCT_STAGING_CAPTIONS.makeCoordinator;
const draws=[],calls=[],queue=[];
const runtime={
 translate(text){calls.push(text);return new Promise(resolve=>queue.push({text,resolve}))},
 cancelPending(){calls.push("[cancel]")},
 reset(){calls.push("[reset]")}
};
const coord=make({runtime,onRender:view=>draws.push(view),maxCacheEntries:2});
assert.equal((await coord.showCue({text:"hello"})).code,"missing-context");
assert.equal(coord.setContext({courseId:"course-1",lectureId:"lec-1",sourceLanguage:"en",targetLanguage:"pt"}),true);
const cue=(id,text)=>({cueId:id,startMs:id*1000,endMs:id*1000+900,text});
const first=coord.showCue(cue(1,"one"));
assert.equal(draws.at(-1).state,"pending");
assert.equal(draws.at(-1).text,"","Source text must not be flashed while waiting");
assert.equal(calls.at(-1),"one");
const duplicate=coord.showCue(cue(1,"one"));
assert.equal(duplicate,first,"Same active cue should share pending Promise");
assert.equal(calls.filter(x=>x==="one").length,1,"No duplicate translation request");
const second=coord.showCue(cue(2,"two"));
assert.equal(draws.at(-1).text,"");
queue[1].resolve({ok:true,code:"translated",text:"DOIS"});
assert.equal((await second).text,"DOIS");
queue[0].resolve({ok:true,code:"translated",text:"UM ATRASADO"});
assert.equal((await first).code,"stale");
assert.equal(draws.at(-1).text,"DOIS","Out-of-order translation cannot overwrite latest cue");
const secondRepeated=await coord.showCue(cue(2,"two"));
assert.equal(secondRepeated.code,"translated","Repeated active cue retains its fulfilled result");
assert.equal(calls.filter(x=>x==="two").length,1);
const third=coord.showCue(cue(3,"three"));
queue[2].resolve({ok:true,code:"translated",text:"TRÊS"});
assert.equal((await third).code,"translated");
assert.equal((await coord.showCue(cue(2,"two"))).code,"cached");
assert.equal(draws.at(-1).fromCache,true);
const fourth=coord.showCue(cue(4,"four"));
queue[3].resolve({ok:true,code:"translated",text:"QUATRO"});
await fourth;
assert.ok(coord.snapshot().cacheSize<=2);
const missing=await coord.showCue(cue(5," "));
assert.equal(missing.code,"no-caption");
assert.equal(draws.at(-1).state,"no-caption");
const error=coord.showCue(cue(6,"fail"));
queue[4].resolve({ok:false,code:"not-ready"});
assert.equal((await error).code,"not-ready");
assert.equal(draws.at(-1).state,"error","No silent blank captions on failure");
assert.equal(draws.at(-1).text,"");
const sameContext={courseId:"course-1",lectureId:"lec-1",sourceLanguage:"en-US",targetLanguage:"en"};
coord.setContext(sameContext);
const beforeCalls=calls.length;
assert.equal((await coord.showCue(cue(7,"Original already matches"))).code,"original");
assert.equal(draws.at(-1).text,"Original already matches");
assert.equal(calls.slice(beforeCalls).filter(x=>x!=="[cancel]").length,0,"Same-language text does not trigger translation");
coord.setContext({courseId:"course-1",lectureId:"lec-2",sourceLanguage:"en",targetLanguage:"pt"});
assert.equal(draws.at(-1).state,"idle","Lecture changes must clear former caption");
const slow=coord.showCue(cue(8,"slow"));
coord.setContext({courseId:"course-1",lectureId:"lec-3",sourceLanguage:"en",targetLanguage:"pt"});
queue[5].resolve({ok:true,code:"translated",text:"OUTDATED LECTURE"});
assert.equal((await slow).code,"stale");
assert.equal(draws.at(-1).state,"idle");
const priorCalls=calls.filter(x=>x==="slow").length;
const newLecture=coord.showCue(cue(8,"slow"));
assert.equal(calls.filter(x=>x==="slow").length,priorCalls+1,"Cache key must include lecture");
queue[6].resolve({ok:true,code:"translated",text:"NOVA AULA"});
await newLecture;
assert.equal(draws.at(-1).text,"NOVA AULA");
coord.clear();
assert.equal(draws.at(-1).state,"no-caption");
assert.equal(coord.snapshot().hasContext,true);

const privacyQueue=[],privacyDraws=[],privacyCalls=[];
const privateRuntime={
 translate(text){return new Promise(resolve=>privacyQueue.push({text,resolve}))},
 cancelPending(){privacyCalls.push("cancel")},
 reset(){privacyCalls.push("reset")}
};
const privacy=make({runtime:privateRuntime,onRender:x=>privacyDraws.push(x)});
const p1={courseId:"private-A",lectureId:"lesson-A",sourceLanguage:"en",targetLanguage:"es"};
const p2={courseId:"private-B",lectureId:"lesson-A",sourceLanguage:"en",targetLanguage:"es"};
assert.equal(privacy.setContext(p1),true);
const priv1=privacy.showCue({cueId:"A",text:"secret contents"});
privacyQueue[0].resolve({ok:true,code:"translated",text:"secret translation"});
await priv1;
assert.equal(privacy.snapshot().cacheSize,1);
privacy.setContext({...p1,lectureId:"lesson-B"});
assert.equal(privacy.snapshot().cacheSize,1,"Same-course lesson switch may keep bounded cache");
privacy.setContext(p2);
assert.equal(privacy.snapshot().cacheSize,0,"Switching course clears translated caption cache");
const priv2=privacy.showCue({cueId:"B",text:"private in progress"});
assert.equal(privacy.snapshot().state,"pending");
assert.equal(privacy.setContext({courseId:"invalid",lectureId:""}),false);
assert.equal(privacy.snapshot().hasContext,false,"Invalid context must clear old course");
assert.equal(privacy.snapshot().cacheSize,0);
assert.equal(privacyDraws.at(-1).state,"error");
assert.equal(privacyDraws.at(-1).courseId,null);
privacyQueue[1].resolve({ok:true,code:"translated",text:"stale private text"});
assert.equal((await priv2).code,"stale");
assert.equal(privacyDraws.at(-1).state,"error","Stale result cannot revive invalid course");
assert.equal((await privacy.showCue({text:"old"})).code,"missing-context");
privacy.setContext(p1);
const p3=privacy.showCue({cueId:"C",text:"close this"});
privacy.close();
assert.equal(privacy.snapshot().hasContext,false);
assert.equal(privacy.snapshot().cacheSize,0,"Close erases cached user text");
assert.equal(privacy.snapshot().state,"idle");
privacyQueue[2].resolve({ok:true,code:"translated",text:"should not render"});
assert.equal((await p3).code,"stale");
assert.equal(privacyDraws.at(-1).state,"idle","Closed UI must not render stale user text");
assert.ok(privacyCalls.filter(x=>x==="reset").length>=2,"Invalid/closed context resets runtime");

const emptyViews=[];let emptyAttempts=0;
const emptyCoord=make({runtime:{
 translate:async()=>{emptyAttempts++;return emptyAttempts===1?{ok:true,code:"translated",text:"  "}:{ok:true,code:"translated",text:"Texto correto"}},
 cancelPending(){}
},onRender:view=>emptyViews.push(view)});
emptyCoord.setContext({courseId:"course",lectureId:"one",sourceLanguage:"en",targetLanguage:"pt"});
const sameCue={cueId:"x",text:"Check whitespace results"};
assert.equal((await emptyCoord.showCue(sameCue)).code,"empty-output");
assert.equal(emptyViews.at(-1).state,"error");
assert.equal(emptyViews.at(-1).reason,"empty-output");
assert.equal(emptyCoord.snapshot().cacheSize,0);
assert.equal((await emptyCoord.showCue(sameCue)).code,"translated","Failed cue is retryable");
assert.equal(emptyAttempts,2);
assert.equal(emptyCoord.snapshot().cacheSize,1);

const staleScreens=[];
let staleAttempts=0;
const recoverable=make({runtime:{
 translate:async()=>{staleAttempts++;return staleAttempts===1?{ok:false,code:"stale"}:{ok:true,code:"translated",text:"Repetição correta"}},
 cancelPending(){}
},onRender:view=>staleScreens.push(view)});
recoverable.setContext({courseId:"retry-course",lectureId:"chapter",sourceLanguage:"en",targetLanguage:"pt"});
const retryCue={cueId:"retry-1",text:"Translate again"};
assert.equal((await recoverable.showCue(retryCue)).code,"stale");
assert.equal(staleScreens.at(-1).state,"error","Cancellation with no newer cue must not be silent");
assert.equal(staleScreens.at(-1).reason,"stale-translation");
assert.equal((await recoverable.showCue(retryCue)).code,"translated","Retry a cancelled cue without changing lecture");
assert.equal(staleAttempts,2);

const invalidScreens=[],pendingInvalid=[];
const malformed=make({runtime:{
 translate:()=>new Promise(resolve=>pendingInvalid.push(resolve)),
 cancelPending(){}
},onRender:view=>invalidScreens.push(view)});
malformed.setContext({courseId:"course",lectureId:"lecture",sourceLanguage:"en",targetLanguage:"es"});
const unfinished=malformed.showCue({cueId:"current",text:"still processing"});
assert.equal((await malformed.showCue({cueId:"broken"})).code,"invalid-cue");
assert.equal(invalidScreens.at(-1).state,"error","Missing text must be visible error");
assert.equal(invalidScreens.at(-1).reason,"invalid-cue");
pendingInvalid[0]({ok:true,code:"translated",text:"obsolete"});
assert.equal((await unfinished).code,"stale");
assert.equal(invalidScreens.at(-1).state,"error","Former cue must not restore output after invalid input");
assert.equal((await malformed.showCue(null)).code,"invalid-cue");
assert.equal((await malformed.showCue({cueId:"valid-empty",text:""})).code,"no-caption","Genuinely empty cue remains distinct");

console.log("BGCT CAPTION COORDINATOR PASS — no source flash, stale cue/lecture suppression, duplicate dedupe, bounded cache, errors, language and context.");
