// BGCT 0.6.1 INTERNAL CANDIDATE: does not replace the 0.6.0 extension.
(function(){"use strict";
 const namespace="bgct-candidate";
 function isAllowedPage(){
  try{
   const u=new URL(location.href);
   return u.protocol==="https:"&&/(^|\.)udemy\.com$/i.test(u.hostname)&&
     /^\/course\/[^/]+\/learn\//i.test(u.pathname);
  }catch{return false}
 }
 if(!isAllowedPage()||document.getElementById(namespace+"-panel"))return;
 const localeApi=globalThis.BGCT_STAGING_LOCALE;
 const factory=globalThis.BGCT_STAGING_SESSION;
 if(!localeApi||!factory||!document.body)return;
 let locale="en",source="en",target="pt",state="idle",detail={},frame=null,video=null,lastLesson=null,closed=false,inactive=false,lastCue=null,blockedPreviousCue=null;
 let observedVideo=null,observedTracks=[],observedCaption=null,captionObserver=null,endedVideo=null;
 const captionSelector='[data-purpose="captions-display"],[data-purpose="captions-container"],[class*="captions-display--captions-container"]';
 const tags={en:"English",pt:"Português",es:"Español"};
 const panel=document.createElement("section");panel.id=namespace+"-panel";
 panel.setAttribute("aria-label","BlackGold Course Translator internal candidate");
 const caption=document.createElement("div");caption.id=namespace+"-caption";caption.hidden=true;caption.setAttribute("aria-live","polite");
 function make(tag,cls,parent){const el=document.createElement(tag);if(cls)el.className=cls;(parent||panel).appendChild(el);return el}
 const heading=make("div","bgct-title");
 const name=make("strong","",heading);name.textContent="BlackGold Course Translator";
 const hide=make("button","",heading);hide.type="button";hide.textContent="×";
 const sub=make("div","bgct-subtitle");sub.textContent="INTERNAL CANDIDATE • NOT RELEASED";
 const langLabel=make("label"),langSelect=make("select");langSelect.id=namespace+"-ui";langLabel.htmlFor=langSelect.id;
 for(const [code,label] of [["en","English"],["pt_BR","Português"],["es","Español"]]){const opt=document.createElement("option");opt.value=code;opt.textContent=label;langSelect.appendChild(opt)}
 const grid=make("div","bgct-pair");
 function langControl(id){
  const area=make("div","",grid),label=make("label","",area),select=make("select","",area);
  select.id=namespace+"-"+id;label.htmlFor=select.id;
  for(const [code,text] of Object.entries(tags)){const opt=document.createElement("option");opt.value=code;opt.textContent=text;select.appendChild(opt)}
  return {label,select};
 }
 const from=langControl("source"),to=langControl("target");
 const start=make("button","bgct-start");start.type="button";
 const status=make("div","bgct-state");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const actions=make("div","bgct-actions"),ecosystem=make("button","",actions),clear=make("button","",actions);
 ecosystem.type=clear.type="button";
 const note=make("div","bgct-note");note.hidden=true;
 document.body.appendChild(panel);document.body.appendChild(caption);
 const session=factory.makeSession({
  onStatus(next,data){state=next;detail=data||{};refresh()},
  onCaption(info){
   frame=info;
   if(info.state==="translated"||info.state==="original"){
    caption.textContent=info.text;caption.hidden=!info.text.trim();
   }else{caption.textContent="";caption.hidden=true}
   refresh();
  }
 });
 function msg(key){return localeApi.message(key,locale)}
 function refresh(){
  if(closed)return;
  langLabel.textContent=msg("labelInterfaceLanguage");
  from.label.textContent=msg("labelSourceLanguage");to.label.textContent=msg("labelTargetLanguage");
  ecosystem.textContent=msg("labelEcosystem");clear.textContent=msg("actionClosePanel");
  const sessionState=session.snapshot();
  const canRetry=sessionState.ready&&frame?.state==="error";
  const modelRetry=state==="needs-activation"&&["create-failed","invalid-session"].includes(detail.reason);
  start.textContent=msg(canRetry?"actionRetryTranslation":modelRetry?"actionRetryModel":"statusNeedsActivation");
  status.textContent=modelRetry?localeApi.captionError(detail.reason,locale):
   frame?.state==="error"?localeApi.captionError(frame.reason,locale):localeApi.status(state,detail.progress,locale);
  if(!video)status.textContent=msg("errorNoCaptions");
  // Activation is permitted only after availability() completes.
  // A loaded model can instead retry the last failed caption without redownloading.
  start.disabled=!(canRetry||(state==="needs-activation"&&!sessionState.originalMode));
  note.textContent=locale==="pt_BR"?"Integração com o manifesto oficial do Ecossistema pendente. Nenhum redirecionamento automático.":locale==="es"?"Integración pendiente del manifiesto oficial del Ecosistema. Sin redirección automática.":"Official Ecosystem manifest integration pending. No automatic redirects.";
  hide.setAttribute("aria-label",msg("actionClosePanel"));
 }
 function cancelCaption(){session.clear();caption.textContent="";caption.hidden=true}
 function persist(key,value){try{void chrome.storage.local.set({[key]:value})}catch{}}
 function changedSettings(){
  cancelCaption();lastLesson=null;
  persist("bgctCandidateSourceLanguage",source);persist("bgctCandidateTargetLanguage",target);
  sync();
 }
 langSelect.addEventListener("change",()=>{locale=langSelect.value;persist("bgctUiLocale",locale);refresh()});
 from.select.addEventListener("change",()=>{source=from.select.value;changedSettings()});
 to.select.addEventListener("change",()=>{target=to.select.value;changedSettings()});
 start.addEventListener("click",()=>{
  const current=session.snapshot();
  if(current.ready&&frame?.state==="error"){
   lastCue=null;sync(); // The caption coordinator has already cleared a failed request.
   return;
  }
  if(state!=="needs-activation"||current.originalMode)return;
  // Deliberately synchronous: never await before the real gesture-based create().
  const p=session.activateFromGesture();
  void p.then(result=>{if(result?.ok)lastCue=null;sync();refresh()}).catch(()=>refresh());
 });
 function deactivatePanel(){
  if(closed||inactive)return;
  inactive=true;
  panel.hidden=true;
  lastLesson=null;lastCue=null;blockedPreviousCue=null;
  stopWatchingVideo();stopWatchingCaptions();
  // Fail closed: release the model and all private course/caption caches.
  session.setLesson(null);
  frame=null;caption.textContent="";caption.hidden=true;
  refresh();
 }
 hide.addEventListener("click",deactivatePanel);
 clear.addEventListener("click",deactivatePanel);
 ecosystem.addEventListener("click",()=>{note.hidden=!note.hidden});
 function reposition(){
  const host=document.fullscreenElement||document.body;
  if(!host)return;
  if(panel.parentNode!==host)host.appendChild(panel);
  if(caption.parentNode!==host)host.appendChild(caption);
 }
 document.addEventListener("fullscreenchange",reposition);
 // React to player activity immediately; the 700ms poll remains a defensive fallback.
 function cueChanged(){if(!closed)sync()}
 function onSeekStart(){lastCue=null;cancelCaption()}
 function onMediaEnd(){endedVideo=video;lastCue=null;cancelCaption()}
 function onMediaResume(){endedVideo=null;lastCue=null;sync()}
 function stopWatchingVideo(){
  if(observedVideo){
   observedVideo.removeEventListener("seeking",onSeekStart);
   observedVideo.removeEventListener("seeked",onMediaResume);
   observedVideo.removeEventListener("play",onMediaResume);
   observedVideo.removeEventListener("ended",onMediaEnd);
   observedVideo.removeEventListener("emptied",onMediaEnd);
  }
  for(const track of observedTracks){try{track.removeEventListener("cuechange",cueChanged)}catch{}}
  observedTracks=[];observedVideo=null;endedVideo=null;
 }
 function watchVideo(current){
  if(current!==observedVideo){
   stopWatchingVideo();
   observedVideo=current;
   if(current){
    current.addEventListener("seeking",onSeekStart);
    current.addEventListener("seeked",onMediaResume);
    current.addEventListener("play",onMediaResume);
    current.addEventListener("ended",onMediaEnd);
    current.addEventListener("emptied",onMediaEnd);
   }
  }
  const tracks=current?.textTracks?Array.from(current.textTracks):[];
  for(const track of observedTracks){
   if(!tracks.includes(track)){try{track.removeEventListener("cuechange",cueChanged)}catch{}}
  }
  for(const track of tracks){
   if(!observedTracks.includes(track)){try{track.addEventListener("cuechange",cueChanged)}catch{}}
  }
  observedTracks=tracks;
 }
 function watchCaptionNode(){
  const node=document.querySelector(captionSelector);
  if(node===observedCaption)return;
  captionObserver?.disconnect();captionObserver=null;observedCaption=node;
  if(node&&typeof MutationObserver==="function"){
   captionObserver=new MutationObserver(()=>{if(!closed)sync()});
   captionObserver.observe(node,{subtree:true,childList:true,characterData:true});
  }
 }
 function stopWatchingCaptions(){captionObserver?.disconnect();captionObserver=null;observedCaption=null}
 function getVideo(){
  const all=[...document.querySelectorAll("video")];
  return all.find(v=>!v.paused&&v.clientWidth&&v.clientHeight)||all.find(v=>v.clientWidth&&v.clientHeight)||all[0]||null;
 }
 function getLesson(){
  const u=new URL(location.href),course=u.pathname.match(/\/course\/([^/]+)\/learn\//);
  if(!course)return null;
  const title=document.querySelector('[data-purpose="lecture-title"]')?.textContent?.trim()||document.title||"";
  // Use a stable lecture ID from the URL; title/marketing query changes are not
  // new lessons and must not abort captions or model preparation.
  const explicitId=["lectureId","lecture_id","lecture","itemId","item_id"]
   .map(key=>u.searchParams.get(key)).find(value=>value&&value.trim());
  const suffix=u.pathname.split("/learn/")[1]||"";
  const lecture=u.pathname+(explicitId?"|"+explicitId:(!suffix?"|"+title.slice(0,150):""));
  return {courseId:course[1],lectureId:lecture,sourceLanguage:source,targetLanguage:target};
 }
 function cueFromTrack(element){
  const tracks=element?.textTracks;
  if(!tracks)return null;
  for(const track of Array.from(tracks)){
   if(track.mode==="disabled"||!track.activeCues?.length)continue;
   const active=Array.from(track.activeCues);
   const text=active.map(c=>String(c.text||"").replace(/<[^>]*>/g,"")).filter(Boolean).join("\n").trim();
   if(text)return {cueId:active.map(c=>c.id||c.startTime+"-"+c.endTime).join("|"),startMs:Math.round(active[0].startTime*1000),endMs:Math.round(active[active.length-1].endTime*1000),text:text.slice(0,1500)};
  }
  return null;
 }
 function cueFromDom(){
  const node=document.querySelector(captionSelector);
  if(!node)return null;
  const text=(node.textContent||"").replace(/\s+/g," ").trim().slice(0,1500);
  return text?{cueId:text,text}:null;
 }
 function sync(){
  if(closed||inactive)return;
  if(!isAllowedPage()){
   // On SPA navigation outside the approved lesson path, erase the old course,
   // loaded model and cached transcripts. Do it only once per departure.
   if(lastLesson!==null){lastLesson=null;void session.setLesson(null)}
   panel.hidden=true;caption.textContent="";caption.hidden=true;
   lastCue=null;blockedPreviousCue=null;video=null;
   stopWatchingVideo();stopWatchingCaptions();refresh();return;
  }
  if(!panel.isConnected||!caption.isConnected)reposition();
  const current=getVideo();
  if(current!==video){
   video=current;lastCue=null;lastLesson=null;blockedPreviousCue=null;cancelCaption();
  }
  watchVideo(video);
  watchCaptionNode();
  if(!video){refresh();return}
  const lesson=getLesson();
  if(!lesson){cancelCaption();refresh();return}
  const key=JSON.stringify(lesson);
  if(key!==lastLesson){
   // The player and DOM can still contain the previous lecture's captions
   // while a single-page navigation switches the lecture URL.
   // Quarantine exactly that last source cue until the caption source changes.
   blockedPreviousCue=lastLesson!==null?lastCue:null;
   lastLesson=key;lastCue=null;
   void session.setLesson(lesson).then(()=>refresh()).catch(()=>refresh());
  }
  const cue=video.seeking||video.ended||endedVideo===video
   ?{text:""}:cueFromTrack(video)||cueFromDom()||{text:""};
  const cueKey=JSON.stringify(cue);
  if(blockedPreviousCue!==null){
   if(cueKey===blockedPreviousCue){
    // Do not translate or show an obsolete caption under the new lecture ID.
    if(lastCue!==cueKey){lastCue=cueKey;session.clear()}
    refresh();return;
   }
   blockedPreviousCue=null;
  }
  if(cueKey!==lastCue){lastCue=cueKey;void session.showCue(cue).catch(()=>{})}
  refresh();
 }
 try{chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
  if(!message||message.channel!=="bgct-candidate")return;
  if(message.type==="open"){
   inactive=false;panel.hidden=false;reposition();sync();
   respond({ok:true});return
  }
  if(message.type==="status"){
   respond({ok:true,candidate:true,state:session.snapshot().modelState,hasVideo:Boolean(video),inactive});
   return
  }
  respond({ok:false});
 });}catch{}
 async function init(){
  try{
   const data=await chrome.storage.local.get(["bgctUiLocale","bgctCandidateSourceLanguage","bgctCandidateTargetLanguage"]);
   locale=localeApi.resolve(data.bgctUiLocale,navigator.languages||[navigator.language]);
   source=Object.hasOwn(tags,data.bgctCandidateSourceLanguage)?data.bgctCandidateSourceLanguage:"en";
   target=Object.hasOwn(tags,data.bgctCandidateTargetLanguage)?data.bgctCandidateTargetLanguage:"pt";
  }catch{locale=localeApi.resolve(null,navigator.languages||[navigator.language])}
  langSelect.value=locale;from.select.value=source;to.select.value=target;
  refresh();sync();
 }
 try{chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=="local")return;
  let changed=false;
  if(changes.bgctUiLocale){locale=localeApi.normalize(changes.bgctUiLocale.newValue)||"en";langSelect.value=locale}
  if(changes.bgctCandidateSourceLanguage){const v=changes.bgctCandidateSourceLanguage.newValue;if(Object.hasOwn(tags,v)&&v!==source){source=v;from.select.value=v;changed=true}}
  if(changes.bgctCandidateTargetLanguage){const v=changes.bgctCandidateTargetLanguage.newValue;if(Object.hasOwn(tags,v)&&v!==target){target=v;to.select.value=v;changed=true}}
  if(changed){cancelCaption();lastLesson=null;sync()}
  refresh();
 });}catch{}
 const timer=setInterval(sync,700);
 window.addEventListener("pagehide",()=>{
  closed=true;clearInterval(timer);stopWatchingVideo();stopWatchingCaptions();
  session.close();caption.remove();panel.remove();
 },{once:true});
 void init();
})();
