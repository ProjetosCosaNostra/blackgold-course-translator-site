// BGCT — caption lifecycle coordinator. STAGING ONLY; no Udemy DOM integration.
// Does not export captions or persist transcript data. It only returns text to the host UI.
(function(root){"use strict";
function makeCoordinator(config={}){
 const runtime=config.runtime;
 if(!runtime||typeof runtime.translate!=="function")throw new TypeError("runtime.translate required");
 const onRender=typeof config.onRender==="function"?config.onRender:()=>{};
 const parsedLimit=Number(config.maxCacheEntries);
 const maxCache=Number.isInteger(parsedLimit)&&parsedLimit>0?Math.min(parsedLimit,500):120;
 const cache=new Map();
 let context=null,revision=0,activeKey=null,activePromise=null,last=null;
 function emit(state,text="",detail={}){
  const view=Object.freeze({state,text,courseId:context?.courseId??null,lectureId:context?.lectureId??null,...detail});
  last=view;
  try{onRender(view)}catch{/* Never crash the translator because a UI callback fails */}
  return view;
 }
 function languageBase(tag){return String(tag||"").toLowerCase().split("-")[0]}
 function readContext(value){
  if(!value||typeof value!=="object")return null;
  const fields=["courseId","lectureId","sourceLanguage","targetLanguage"];
  const item={};
  for(const field of fields){
   const v=value[field];
   if(typeof v!=="string"||!v.trim())return null;
   item[field]=v.trim();
  }
  return item;
 }
 function setContext(input){
  const next=readContext(input);
  if(!next){emit("error","",{reason:"invalid-context"});return false}
  const changed=!context||Object.keys(next).some(field=>context[field]!==next[field]);
  if(!changed)return true;
  const previous=context;
  ++revision;activeKey=null;activePromise=null;context=next;
  const pairChanged=previous&&(
   previous.sourceLanguage!==next.sourceLanguage||
   previous.targetLanguage!==next.targetLanguage
  );
  // Preserve downloaded model when only lecture changes.
  if(pairChanged&&typeof runtime.reset==="function")runtime.reset();
  else if(typeof runtime.cancelPending==="function")runtime.cancelPending();
  emit("idle");
  return true;
 }
 function cacheGet(key){
  if(!cache.has(key))return null;
  const value=cache.get(key);
  cache.delete(key);cache.set(key,value);
  return value;
 }
 function cacheSave(key,value){
  cache.delete(key);cache.set(key,value);
  while(cache.size>maxCache)cache.delete(cache.keys().next().value);
 }
 function showCue(cue){
  if(!context){emit("error","",{reason:"missing-context"});return Promise.resolve({ok:false,code:"missing-context"})}
  const text=cue&&typeof cue.text==="string"?cue.text:"";
  const meta=cue&&typeof cue==="object"?cue:{};
  const key=JSON.stringify([
   context.courseId,context.lectureId,context.sourceLanguage,context.targetLanguage,
   String(meta.cueId??""),Number.isFinite(meta.startMs)?meta.startMs:null,
   Number.isFinite(meta.endMs)?meta.endMs:null,text
  ]);
  if(activeKey===key&&activePromise)return activePromise;
  ++revision;
  const token=revision;
  activeKey=key;activePromise=null;
  const detail={cueId:String(meta.cueId??"")};
  if(!text.trim()){
   if(typeof runtime.cancelPending==="function")runtime.cancelPending();
   emit("no-caption","",detail);
   const answer=Promise.resolve({ok:true,code:"no-caption"});
   activePromise=answer;return answer;
  }
  if(languageBase(context.sourceLanguage)===languageBase(context.targetLanguage)){
   if(typeof runtime.cancelPending==="function")runtime.cancelPending();
   emit("original",text,detail);
   const answer=Promise.resolve({ok:true,code:"original",text});
   activePromise=answer;return answer;
  }
  const hit=cacheGet(key);
  if(hit!==null){
   if(typeof runtime.cancelPending==="function")runtime.cancelPending();
   emit("translated",hit,{...detail,fromCache:true});
   const answer=Promise.resolve({ok:true,code:"cached",text:hit});
   activePromise=answer;return answer;
  }
  // Deliberately do not display the source text while target-language translation is pending.
  emit("pending","",detail);
  const promise=(async()=>{
   let result;
   try{result=await runtime.translate(text)}
   catch{result={ok:false,code:"runtime-error"}}
   if(token!==revision||activeKey!==key)return {ok:false,code:"stale"};
   if(result&&result.ok&&result.code==="translated"&&typeof result.text==="string"){
    cacheSave(key,result.text);
    emit("translated",result.text,detail);
    return result;
   }
   if(result?.code==="stale")return {ok:false,code:"stale"};
   const reason=String(result?.code||"unknown-translation-error");
   emit("error","",{...detail,reason});
   return {ok:false,code:reason};
  })();
  activePromise=promise;
  return promise;
 }
 function clear(){
  revision++;activeKey=null;activePromise=null;
  if(typeof runtime.cancelPending==="function")runtime.cancelPending();
  emit("no-caption");
 }
 function snapshot(){
  return Object.freeze({hasContext:Boolean(context),courseId:context?.courseId??null,
   lectureId:context?.lectureId??null,cacheSize:cache.size,revision,
   state:last?.state??"idle"});
 }
 return Object.freeze({setContext,showCue,clear,snapshot});
}
root.BGCT_STAGING_CAPTIONS=Object.freeze({makeCoordinator});
if(typeof module!=="undefined"&&module.exports)module.exports=root.BGCT_STAGING_CAPTIONS;
})(globalThis);
