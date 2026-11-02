(function(){"use strict";
const i18n=globalThis.BGCT_STAGING_LOCALE;
const ui=document.getElementById("ui"),source=document.getElementById("source"),target=document.getElementById("target"),status=document.getElementById("status");
let locale="en";
function setStatus(msg){status.textContent=msg}
function refresh(){
 document.getElementById("ui-label").textContent=i18n.message("labelInterfaceLanguage",locale);
 document.getElementById("source-label").textContent=i18n.message("labelSourceLanguage",locale);
 document.getElementById("target-label").textContent=i18n.message("labelTargetLanguage",locale);
 document.getElementById("open").textContent=i18n.message("actionOpenPanel",locale);
 const info={pt_BR:"Candidato interno, não publicado. A extensão 0.6.0 permanece intacta.",en:"Internal candidate, not published. The original 0.6.0 is unchanged.",es:"Candidato interno sin publicar. La extensión 0.6.0 permanece intacta."};
 document.getElementById("availability").textContent=info[locale]||info.en;
}
async function store(key,value){try{await chrome.storage.local.set({[key]:value})}catch{setStatus("Unable to save preferences")}}
ui.addEventListener("change",()=>{locale=ui.value;refresh();void store("bgctUiLocale",locale)});
source.addEventListener("change",()=>{void store("bgctCandidateSourceLanguage",source.value)});
target.addEventListener("change",()=>{void store("bgctCandidateTargetLanguage",target.value)});
document.getElementById("open").addEventListener("click",async()=>{
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id){setStatus(i18n.message("errorUnsupportedPage",locale));return}
  const reply=await chrome.tabs.sendMessage(tab.id,{channel:"bgct-candidate",type:"open"});
  setStatus(reply?.ok?"✓":i18n.message("errorUnsupportedPage",locale));
 }catch{setStatus(i18n.message("errorUnsupportedPage",locale))}
});
(async()=>{
 try{
  const d=await chrome.storage.local.get(["bgctUiLocale","bgctCandidateSourceLanguage","bgctCandidateTargetLanguage"]);
  locale=i18n.resolve(d.bgctUiLocale,navigator.languages||[navigator.language]);
  ui.value=locale;
  source.value=["en","pt","es"].includes(d.bgctCandidateSourceLanguage)?d.bgctCandidateSourceLanguage:"en";
  target.value=["en","pt","es"].includes(d.bgctCandidateTargetLanguage)?d.bgctCandidateTargetLanguage:"pt";
 }catch{locale=i18n.resolve(null,navigator.languages||[navigator.language]);ui.value=locale}
 refresh();
})();
})();
