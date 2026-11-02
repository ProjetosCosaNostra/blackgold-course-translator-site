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
 let locale="en",source="en",target="pt",state="idle",detail={},frame=null,video=null,lastLesson=null,closed=false,inactive=false,lastCue=null,lastMeaningfulCue=null,mediaBoundaryCue=null,mediaSource=null,mediaRevision=0,blockedPreviousCue=null,blockedCaptionVersion=null,captionEventVersion=0,routeHidden=false;
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
  start.disabled=!video||!(canRetry||(state==="needs-activation"&&!sessionState.originalMode));
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
  lastLesson=null;lastCue=null;lastMeaningfulCue=null;mediaBoundaryCue=null;blockedPreviousCue=null;blockedCaptionVersion=null;
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
 function cueChanged(){captionEventVersion++;if(!closed)sync()}
 function onSeekStart(){lastCue=null;cancelCaption()}
 function onMediaEnd(){endedVideo=video;lastCue=null;cancelCaption()}
 function onMediaResume(){endedVideo=null;lastCue=null;sync()}
 function readMediaSource(element){
  if(!element)return "";
  // URL is used only for in-memory equality; do not log, cache or persist it.
  return element.currentSrc||element.getAttribute("src")||
   element.querySelector("source[src]")?.src||"";
 }
 function mediaSourceChanged(){
  mediaBoundaryCue=lastMeaningfulCue||lastCue;
  mediaRevision++;
 }
 function onMediaLoadStart(){if(!closed&&!inactive)sync()}
 function stopWatchingVideo(){
  if(observedVideo){
   observedVideo.removeEventListener("loadstart",onMediaLoadStart);
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
    current.addEventListener("loadstart",onMediaLoadStart);
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
   captionObserver=new MutationObserver(()=>{captionEventVersion++;if(!closed)sync()});
   captionObserver.observe(node,{subtree:true,childList:true,characterData:true});
  }
 }
 function stopWatchingCaptions(){captionObserver?.disconnect();captionObserver=null;observedCaption=null}
 function getVideo(){
  // A lesson page can also have a tiny autoplaying preview. Do not treat
  // the first playing <video> as the lecture when a larger player is visible.
  const fullscreen=document.fullscreenElement;
  const visible=[];
  for(const candidate of document.querySelectorAll("video")){
   if(!candidate.isConnected||candidate.hidden)continue;
   if(fullscreen&&fullscreen!==candidate&&!fullscreen.contains(candidate))continue;
   const style=getComputedStyle(candidate);
   if(style.display==="none"||style.visibility==="hidden"||Number(style.opacity)===0)continue;
   const box=candidate.getBoundingClientRect();
   if(box.width<160||box.height<90)continue;
   const screenWidth=innerWidth||document.documentElement.clientWidth;
   const screenHeight=innerHeight||document.documentElement.clientHeight;
   if(box.right<=0||box.bottom<=0||box.left>=screenWidth||box.top>=screenHeight)continue;
   const area=Math.min(box.right,screenWidth)-Math.max(box.left,0);
   const height=Math.min(box.bottom,screenHeight)-Math.max(box.top,0);
   const visibleArea=Math.max(0,area)*Math.max(0,height);
   if(!visibleArea)continue;
   visible.push({element:candidate,score:visibleArea*(candidate.paused?1:1.15)});
  }
  if(!visible.length)return null; // Never attach to an off-screen/hidden video.
  visible.sort((a,b)=>b.score-a.score);
  // Keep a stable player if a similarly-sized promo briefly starts playing.
  const previous=visible.find(item=>item.element===observedVideo);
  return previous&&previous.score>=visible[0].score*0.9?previous.element:visible[0].element;
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
  const lecture=u.pathname+(explicitId?"|"+explicitId:(!suffix?"|"+title.slice(0,150):""))+"|media-revision:"+mediaRevision;
  return {courseId:course[1],lectureId:lecture,sourceLanguage:source,targetLanguage:target};
 }
 function cueFromTrack(element){
  const tracks=element?.textTracks;
  if(!tracks)return {cue:null,wrongLanguageShowing:false};
  const sourceBase=String(source).toLowerCase().replace(/_/g,"-").split("-")[0];
  const options=[];
  let wrongLanguageShowing=false;
  for(const track of Array.from(tracks)){
   if(track.mode==="disabled")continue;
   const language=typeof track.language==="string"?track.language.trim().toLowerCase().replace(/_/g,"-").split("-")[0]:"";
   const matching=language===sourceBase;
   if(track.mode==="showing"&&language&&!matching)wrongLanguageShowing=true;
   // Never translate an unidentified or hidden track when a different
   // language is visibly selected; avoid mixing captions from two languages.
   if(language&&!matching)continue;
   if(!language&&track.mode!=="showing")continue;
   const active=track.activeCues?Array.from(track.activeCues):[];
   const text=active.map(c=>String(c.text||"").replace(/<[^>]*>/g,"")).filter(Boolean).join("\n").trim();
   if(!text)continue;
   options.push({
    priority:(matching?2:0)+(track.mode==="showing"?1:0),
    cue:{cueId:active.map(c=>c.id||c.startTime+"-"+c.endTime).join("|"),
     startMs:Math.round(active[0].startTime*1000),
     endMs:Math.round(active[active.length-1].endTime*1000),
     text:text.slice(0,1500)}
   });
  }
  // Exact source-language match takes precedence over unidentified tracks.
  options.sort((a,b)=>b.priority-a.priority);
  const matchingCue=options.find(item=>item.priority>=2)?.cue||null;
  return {cue:matchingCue||(wrongLanguageShowing?null:options[0]?.cue||null),wrongLanguageShowing};
 }
 function cueFromDom(){
  const node=document.querySelector(captionSelector);
  if(!node||!node.isConnected)return null;
  // Udemy can hide the entire caption wrapper without hiding its text node.
  for(let parent=node;parent&&parent.nodeType===1;parent=parent.parentElement){
   if(parent.hidden||parent.getAttribute("aria-hidden")==="true")return null;
   const style=getComputedStyle(parent);
   if(style.display==="none"||style.visibility==="hidden"||style.visibility==="collapse"||Number(style.opacity)===0)return null;
   if(parent===document.body)break;
  }
  const text=(node.textContent||"").replace(/\s+/g," ").trim().slice(0,1500);
  return text?{cueId:text,text}:null;
 }
 function sync(){
  if(closed||inactive)return;
  if(!isAllowedPage()){
   // On SPA navigation outside the approved lesson path, erase the old course,
   // loaded model and cached transcripts. Do it only once per departure.
   if(lastLesson!==null){lastLesson=null;void session.setLesson(null)}
   panel.hidden=true;routeHidden=true;caption.textContent="";caption.hidden=true;
   lastCue=null;lastMeaningfulCue=null;mediaBoundaryCue=null;mediaSource=null;mediaRevision=0;
   blockedPreviousCue=null;blockedCaptionVersion=null;video=null;
   stopWatchingVideo();stopWatchingCaptions();refresh();return;
  }
  if(routeHidden){
   // The panel was hidden by an unsupported route, not by the learner.
   // Restore the in-page control when returning to a lesson.
   panel.hidden=false;routeHidden=false;
  }
  if(!panel.isConnected||!caption.isConnected)reposition();
  const current=getVideo();
  if(current!==video){
   // A replacement lecture player can arrive while the old caption DOM
   // still shows the previous video's final cue. Quarantine that exact cue.
   const inheritedCue=video?(lastCue||blockedPreviousCue):blockedPreviousCue;
   video=current;lastCue=null;lastMeaningfulCue=null;mediaBoundaryCue=null;
   mediaSource=readMediaSource(video);mediaRevision=0;lastLesson=null;
   blockedPreviousCue=inheritedCue;blockedCaptionVersion=inheritedCue!==null?captionEventVersion:null;
   cancelCaption();
  }else if(video){
   const nextSource=readMediaSource(video);
   if(nextSource!==mediaSource){mediaSource=nextSource;mediaSourceChanged()}
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
   if(blockedPreviousCue===null){
    blockedPreviousCue=mediaBoundaryCue!==null?mediaBoundaryCue:
     lastLesson!==null?lastCue:null;
    blockedCaptionVersion=blockedPreviousCue!==null?captionEventVersion:null;
   }
   mediaBoundaryCue=null;lastMeaningfulCue=null;
   lastLesson=key;lastCue=null;
   void session.setLesson(lesson).then(()=>refresh()).catch(()=>refresh());
  }
  const trackChoice=cueFromTrack(video);
  const cue=video.seeking||video.ended||endedVideo===video
   ?{text:""}:trackChoice.cue||(!trackChoice.wrongLanguageShowing?cueFromDom():null)||{text:""};
  const cueKey=JSON.stringify(cue);
  if(blockedPreviousCue!==null){
   if(cueKey===blockedPreviousCue&&captionEventVersion===blockedCaptionVersion){
    // Same inherited cue, with no new caption-source event: quarantine it.
    if(lastCue!==cueKey){lastCue=cueKey;session.clear()}
    refresh();return;
   }
   // An actual TextTrack cuechange or caption DOM mutation is evidence of a
   // new cue even when two consecutive lessons use the identical phrase.
   blockedPreviousCue=null;blockedCaptionVersion=null;
   // The quarantined key was recorded as lastCue while suppressed. It has not
   // been rendered, so force the same text through the new lesson's coordinator.
   lastCue=null;
  }
  if(cueKey!==lastCue){
   lastCue=cueKey;
   if(typeof cue.text==="string"&&cue.text.trim())lastMeaningfulCue=cueKey;
   void session.showCue(cue).catch(()=>{});
  }
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
