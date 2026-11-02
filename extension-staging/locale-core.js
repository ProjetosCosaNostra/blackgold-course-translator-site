// Standalone, source-independent localization helper for future BGCT extension integration.
// Load staging catalog first; compatible with classic Manifest V3 content scripts and popup scripts.
// The real extension source has not been mounted here; this code is NOT a released fix.
(function(root){"use strict";
const catalogs = root.BGCT_STAGING_CATALOGS || {};
const supported = Object.freeze(["en","pt_BR","es"]);
const storageKey = "bgctUiLocale";
function normalize(input){
  const text=String(input||"").trim().replace(/-/g,"_").toLowerCase();
  if(text==="pt"||text==="pt_br"||text.startsWith("pt_"))return "pt_BR";
  if(text==="es"||text.startsWith("es_"))return "es";
  if(text==="en"||text.startsWith("en_"))return "en";
  return null;
}
function resolve(manual,deviceLanguages){
 const picked=normalize(manual);
 if(picked)return picked;
 const list=Array.isArray(deviceLanguages)?deviceLanguages:[deviceLanguages];
 for(const language of list){const l=normalize(language);if(l)return l}
 return "en";
}
function message(key,locale,args={}){
  if(typeof key!=="string"||!key)return "";
  const lang=normalize(locale)||"en";
  const dictionary=catalogs[lang]||catalogs.en||{};
  const fallback=catalogs.en||{};
  const template=dictionary[key]??fallback[key];
  if(typeof template!=="string")return "";
  return template.replace(/\$PERCENT\$/g,()=>{
    const raw=Number(args.percent);
    if(!Number.isFinite(raw))return "?";
    return String(Math.max(0,Math.min(100,Math.round(raw))));
  });
}
const statusKeys=Object.freeze({
 "api-unavailable":"statusApiUnavailable",
 "pair-unavailable":"statusPairUnavailable",
 downloading:"statusDownloading",
 loading:"statusLoading",
 translating:"statusTranslating",
 error:"statusError",
 ready:"statusReady"
});
function status(statusValue,downloadProgress,locale){
 if(statusValue==="downloading" && Number.isFinite(downloadProgress)){
  return message("statusDownloadingProgress",locale,{percent:downloadProgress});
 }
 return message(statusKeys[statusValue]||"statusPreparing",locale);
}
async function getSaved(storage){
 if(!storage||typeof storage.get!=="function")return null;
 try{const data=await storage.get([storageKey]);return normalize(data?.[storageKey])}catch{return null}
}
async function save(storage,locale){
 const normalized=normalize(locale);
 if(!normalized||!storage||typeof storage.set!=="function")return false;
 try{await storage.set({[storageKey]:normalized});return true}catch{return false}
}
const api=Object.freeze({storageKey,supported,normalize,resolve,message,status,getSaved,save});
root.BGCT_STAGING_LOCALE = api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
