// STAGING ONLY: browser Translator API + caption lifecycle; no Udemy DOM or production side effects.
(function(root){"use strict";
function makeSession(config={}){
 const a=root.BGCT_STAGING_TRANSLATOR,b=root.BGCT_STAGING_CAPTIONS;
 if(!a||!b)throw new Error("BGCT staging dependencies must load first");
 const onStatus=typeof config.onStatus==="function"?config.onStatus:()=>{};
 const onCaption=typeof config.onCaption==="function"?config.onCaption:()=>{};
 const runtime=a.makeRuntime({
  ...(Object.prototype.hasOwnProperty.call(config,"TranslatorCtor")?{TranslatorCtor:config.TranslatorCtor}:{}),
  ...(Object.prototype.hasOwnProperty.call(config,"AbortControllerCtor")?{AbortControllerCtor:config.AbortControllerCtor}:{}),
  onState(state,detail){try{onStatus(state,detail)}catch{}},
  onProgress(percent){try{config.onProgress?.(percent)}catch{}}
 });
 const captions=b.makeCoordinator({runtime,maxCacheEntries:config.maxCacheEntries,
  onRender(view){try{onCaption(view)}catch{}}
 });
 let pair=null,closed=false,revision=0,preparing=null;
 function readPair(input){
  if(!input||typeof input!=="object")return null;
  for(const key of ["courseId","lectureId","sourceLanguage","targetLanguage"]){
   if(typeof input[key]!=="string"||!input[key].trim())return null;
  }
  return [input.sourceLanguage.trim().toLowerCase(),input.targetLanguage.trim().toLowerCase()].join("|");
 }
 function setLesson(input){
  if(closed)return Promise.resolve({ok:false,code:"closed"});
  const next=readPair(input);
  if(!next){
   revision++;preparing=null;pair=null;captions.setContext(input);
   return Promise.resolve({ok:false,code:"invalid-context"});
  }
  const pairChanged=pair!==next;
  pair=next;
  if(!captions.setContext(input)){revision++;preparing=null;pair=null;return Promise.resolve({ok:false,code:"invalid-context"})}
  if(!pairChanged){
   if(runtime.snapshot().ready)return Promise.resolve({ok:true,code:"ready"});
   if(preparing)return preparing;
   const model=runtime.snapshot();
   if(model.pending)return Promise.resolve({ok:true,code:"needs-activation"});
   // A lecture transition during model download must not cancel/restart it.
   if(model.state==="loading"||model.state==="downloading")
    return Promise.resolve({ok:true,code:"model-loading"});
  }
  const token=++revision;
  const task=(async()=>{
   const result=await runtime.inspect(input.sourceLanguage.trim(),input.targetLanguage.trim());
   if(token!==revision||closed)return {ok:false,code:"stale"};
   return result;
  })();
  preparing=task;
  void task.then(()=>{if(preparing===task)preparing=null},()=>{if(preparing===task)preparing=null});
  return task;
 }
 // MUST be called directly from a trusted click: no await before Translator.create.
 function activateFromGesture(){
  if(closed||!pair)return Promise.resolve({ok:false,code:closed?"closed":"no-context"});
  return runtime.startFromGesture();
 }
 function showCue(cue){
  if(closed||!pair)return Promise.resolve({ok:false,code:closed?"closed":"no-context"});
  if(!runtime.snapshot().ready){captions.clear();return Promise.resolve({ok:false,code:"not-ready"})}
  return captions.showCue(cue);
 }
 function clear(){if(!closed)captions.clear()}
 function close(){
  if(closed)return;
  closed=true;revision++;preparing=null;pair=null;captions.close();
 }
 function snapshot(){
  const s=captions.snapshot(),r=runtime.snapshot();
  return Object.freeze({closed,selectedPair:pair,ready:r.ready,modelState:r.state,
   captionState:s.state,courseId:s.courseId,lectureId:s.lectureId,cacheSize:s.cacheSize});
 }
 return Object.freeze({setLesson,activateFromGesture,showCue,clear,close,snapshot});
}
root.BGCT_STAGING_SESSION=Object.freeze({makeSession});
if(typeof module!=="undefined"&&module.exports)module.exports=root.BGCT_STAGING_SESSION;
})(globalThis);
