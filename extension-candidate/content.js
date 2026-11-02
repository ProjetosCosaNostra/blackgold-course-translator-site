// BGCT 0.6.1 INTERNAL CANDIDATE: does not replace the 0.6.0 extension.
(function(){"use strict";
 const namespace="bgct-candidate";
 const allowed=/^https:\/\/([a-z0-9-]+\.)*udemy\.com\/course\/[^/]+\/learn\//i;
 if(!allowed.test(location.href)||document.getElementById(namespace+"-panel"))return;
 const localeApi=globalThis.BGCT_STAGING_LOCALE;
 const factory=globalThis.BGCT_STAGING_SESSION;
 if(!localeApi||!factory||!document.body)return;
 let locale="en",source="en",target="pt",state="idle",detail={},frame=null,video=null,lastLesson=null,closed=false,lastCue=null;
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
  start.textContent=msg("statusNeedsActivation");
  status.textContent=frame?.state==="error"?
   localeApi.captionError(frame.reason,locale):localeApi.status(state,detail.progress,locale);
  if(!video)status.textContent=msg("errorNoCaptions");
  start.disabled=state==="downloading"||state==="loading"||state==="ready"||state==="translating";
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
  // Deliberately synchronous: never await before the real gesture-based create().
  const p=session.activateFromGesture();
  void p.then(result=>{if(result?.ok)lastCue=null;sync();refresh()}).catch(()=>refresh());
 });
 hide.addEventListener("click",()=>{panel.hidden=true});
 clear.addEventListener("click",()=>{panel.hidden=true;cancelCaption()});
 ecosystem.addEventListener("click",()=>{note.hidden=!note.hidden});
 function reposition(){
  const host=document.fullscreenElement||document.body;
  if(!host)return;
  if(panel.parentNode!==host)host.appendChild(panel);
  if(caption.parentNode!==host)host.appendChild(caption);
 }
 document.addEventListener("fullscreenchange",reposition);
 function getVideo(){
  const all=[...document.querySelectorAll("video")];
  return all.find(v=>!v.paused&&v.clientWidth&&v.clientHeight)||all.find(v=>v.clientWidth&&v.clientHeight)||all[0]||null;
 }
 function getLesson(){
  const u=new URL(location.href),course=u.pathname.match(/\/course\/([^/]+)\/learn\//);
  if(!course)return null;
  const title=document.querySelector('[data-purpose="lecture-title"]')?.textContent?.trim()||document.title||"";
  const lecture=u.pathname+"?"+u.searchParams.toString()+"|"+title.slice(0,150);
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
  const node=document.querySelector('[data-purpose="captions-display"],[data-purpose="captions-container"],[class*="captions-display--captions-container"]');
  if(!node)return null;
  const text=(node.textContent||"").replace(/\s+/g," ").trim().slice(0,1500);
  return text?{cueId:text,text}:null;
 }
 function sync(){
  if(closed)return;
  if(!allowed.test(location.href)){
   // On SPA navigation outside the approved lesson path, erase the old course,
   // loaded model and cached transcripts. Do it only once per departure.
   if(lastLesson!==null){lastLesson=null;void session.setLesson(null)}
   panel.hidden=true;caption.textContent="";caption.hidden=true;lastCue=null;video=null;
   refresh();return;
  }
  if(!panel.isConnected||!caption.isConnected)reposition();
  const current=getVideo();
  if(current!==video){video=current;lastCue=null;lastLesson=null;cancelCaption()}
  if(!video){refresh();return}
  const lesson=getLesson();
  if(!lesson){cancelCaption();refresh();return}
  const key=JSON.stringify(lesson);
  if(key!==lastLesson){lastLesson=key;lastCue=null;void session.setLesson(lesson).then(()=>refresh()).catch(()=>refresh())}
  const cue=cueFromTrack(video)||cueFromDom()||{text:""};
  const cueKey=JSON.stringify(cue);
  if(cueKey!==lastCue){lastCue=cueKey;void session.showCue(cue).catch(()=>{})}
  refresh();
 }
 try{chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
  if(!message||message.channel!=="bgct-candidate")return;
  if(message.type==="open"){panel.hidden=false;reposition();sync();respond({ok:true});return}
  if(message.type==="status"){respond({ok:true,candidate:true,state:session.snapshot().modelState,hasVideo:Boolean(video)});return}
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
 window.addEventListener("pagehide",()=>{closed=true;clearInterval(timer);session.close();caption.remove();panel.remove()},{once:true});
 void init();
})();
