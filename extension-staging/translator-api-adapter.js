// BGCT Translator API runtime — isolated adapter for future integration.
// No network, remote API, or automatic model download; Chrome/Edge built-in Translator only.
// CRITICAL: call startFromGesture() directly from a real user click/gesture.
// This is staging code. It is not part of the installed BGCT 0.6.0.
(function(root){"use strict";
function makeRuntime(config={}){
 const states=new Set(["idle","loading","needs-activation","downloading","ready","translating","pair-unavailable","api-unavailable","error"]);
 const getCtor=()=>Object.prototype.hasOwnProperty.call(config,"TranslatorCtor")?config.TranslatorCtor:root.Translator;
 const onState=typeof config.onState==="function"?config.onState:()=>{};
 const onProgress=typeof config.onProgress==="function"?config.onProgress:()=>{};
 let generation=0,translationRevision=0,pending=null,active=null,activeAbort=null,setupAbort=null,currentState="idle";
 function inform(state,detail={}){
  if(!states.has(state))throw new Error("Unsupported translator state: "+state);
  currentState=state;
  try{onState(state,detail)}catch{/* UI observers must never crash translation */}
 }
 function destroyActive(){const x=active;active=null;if(x&&typeof x.destroy==="function"){try{x.destroy()}catch{/* cleanup best effort */}}}
 function stopTranslation(){
  const controller=activeAbort;activeAbort=null;
  if(controller&&typeof controller.abort==="function"){try{controller.abort()}catch{/* already stopped */}}
 }
 function abortSetup(){const c=setupAbort;setupAbort=null;if(c&&typeof c.abort==="function"){try{c.abort()}catch{/* already terminated */}}}
 function invalidate(){generation++;translationRevision++;stopTranslation();abortSetup();pending=null;destroyActive();return generation}
 function cancelPending(){translationRevision++;stopTranslation();if(active)inform("ready")}
 function reset(){invalidate();inform("idle")}
 function supported(){
  const T=getCtor();
  return Boolean(T&&typeof T.availability==="function"&&typeof T.create==="function");
 }
 function normalizeLanguage(value){
  const code=String(value||"").trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code)?code:null;
 }
 async function inspect(sourceLanguage,targetLanguage){
  const token=invalidate();
  const source=normalizeLanguage(sourceLanguage),target=normalizeLanguage(targetLanguage);
  if(!source||!target){inform("pair-unavailable",{reason:"invalid-language"});return {ok:false,code:"invalid-language"}}
  if(source.toLowerCase()===target.toLowerCase()){inform("pair-unavailable",{reason:"same-language"});return {ok:false,code:"same-language"}}
  const T=getCtor();
  if(!supported()){inform("api-unavailable");return {ok:false,code:"api-unavailable"}}
  inform("loading");
  let availability;
  try{availability=await T.availability({sourceLanguage:source,targetLanguage:target})}
  catch(err){if(token!==generation)return {ok:false,code:"stale"};inform("error",{reason:"availability-failed"});return {ok:false,code:"availability-failed"}}
  if(token!==generation)return {ok:false,code:"stale"};
  if(availability==="unavailable"){inform("pair-unavailable");return {ok:false,code:"pair-unavailable"}}
  if(!["available","downloadable","downloading"].includes(availability)){
    inform("error",{reason:"unknown-availability"});
    return {ok:false,code:"unknown-availability"};
  }
  pending={sourceLanguage:source,targetLanguage:target,availability,token};
  inform("needs-activation",{availability});
  return {ok:true,code:"needs-activation",availability};
 }
 // Must be invoked directly from user interaction; no await before Translator.create().
 async function startFromGesture(){
  const task=pending,token=generation;
  if(!task||task.token!==token)return {ok:false,code:"not-inspected"};
  if(!supported()){inform("api-unavailable");return {ok:false,code:"api-unavailable"}}
  pending=null;
  inform(task.availability==="available"?"loading":"downloading",{availability:task.availability});
  let promise;
  let downloadOpen=true;
  const Controller=Object.prototype.hasOwnProperty.call(config,"AbortControllerCtor")
   ?config.AbortControllerCtor:root.AbortController;
  let createController=null;
  if(typeof Controller==="function"){try{createController=new Controller()}catch{/* use sequence fallback */}}
  setupAbort=createController;
  try{
   // The create() call occurs synchronously before the async function first yields.
   promise=getCtor().create({
    sourceLanguage:task.sourceLanguage,
    targetLanguage:task.targetLanguage,
    ...(createController?{signal:createController.signal}:{}),
    monitor(observer){
     if(!observer||typeof observer.addEventListener!=="function")return;
     observer.addEventListener("downloadprogress",event=>{
      if(token!==generation||!downloadOpen)return;
      const value=event?.loaded;
      if(typeof value!=="number"||!Number.isFinite(value))return;
      const total=event?.total;
      const ratio=typeof total==="number"&&Number.isFinite(total)&&total>0?value/total:value;
      const percent=Math.max(0,Math.min(100,Math.round(ratio*100)));
      inform("downloading",{progress:percent});
      try{onProgress(percent)}catch{/* ignore UI callback errors */}
     });
    }
   });
  }catch{downloadOpen=false;if(token===generation){abortSetup();inform("error",{reason:"create-failed"})}return {ok:false,code:"create-failed"}}
  let translator;
  try{translator=await promise}
  catch{downloadOpen=false;if(token!==generation)return {ok:false,code:"stale"};abortSetup();inform("error",{reason:"create-failed"});return {ok:false,code:"create-failed"}}
  downloadOpen=false;
  if(token!==generation){
   try{translator?.destroy?.()}catch{}
   return {ok:false,code:"stale"};
  }
  if(!translator||typeof translator.translate!=="function"){
   abortSetup();
   try{translator?.destroy?.()}catch{}
   inform("error",{reason:"invalid-session"});
   return {ok:false,code:"invalid-session"};
  }
  active=translator;
  inform("ready");
  return {ok:true,code:"ready"};
 }
 async function translate(text){
  const translator=active,token=generation;
  if(!translator)return {ok:false,code:"not-ready"};
  if(typeof text!=="string")return {ok:false,code:"invalid-text"};
  // A newer cue cancels queued work in browsers that implement AbortSignal.
  // The sequence guard remains mandatory when a browser ignores cancellation.
  const revision=++translationRevision;
  stopTranslation();
  if(!text.trim()){inform("ready");return {ok:true,code:"empty",text:""}}
  inform("translating");
  const Controller=Object.prototype.hasOwnProperty.call(config,"AbortControllerCtor")
   ?config.AbortControllerCtor:root.AbortController;
  let controller=null;
  if(typeof Controller==="function"){
   try{controller=new Controller()}catch{/* fall back to sequence guard */}
  }
  activeAbort=controller;
  let result;
  try{
   result=await (controller
    ?translator.translate(text,{signal:controller.signal})
    :translator.translate(text));
  }catch{
   if(token!==generation||revision!==translationRevision||translator!==active)return {ok:false,code:"stale"};
   inform("error",{reason:"translate-failed"});
   return {ok:false,code:"translate-failed"};
  }finally{
   if(activeAbort===controller)activeAbort=null;
  }
  if(token!==generation||revision!==translationRevision||translator!==active)return {ok:false,code:"stale"};
  if(typeof result!=="string"){
   inform("error",{reason:"non-text-result"});
   return {ok:false,code:"non-text-result"};
  }
  // A successful promise with no caption text is NOT a successful translation.
  // Keep the visible error state and never silently blank the subtitles.
  if(!result.trim()){
   inform("error",{reason:"empty-output"});
   return {ok:false,code:"empty-output"};
  }
  inform("ready");
  return {ok:true,code:"translated",text:result};
 }
 function snapshot(){return Object.freeze({state:currentState,generation,ready:Boolean(active),pending:Boolean(pending)})}
 return Object.freeze({supported,inspect,startFromGesture,translate,cancelPending,reset,snapshot});
}
root.BGCT_STAGING_TRANSLATOR=Object.freeze({makeRuntime});
if(typeof module!=="undefined"&&module.exports)module.exports=root.BGCT_STAGING_TRANSLATOR;
})(globalThis);
