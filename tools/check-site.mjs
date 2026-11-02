// BGCT site static validation — Node.js built-ins only, no external services.
// This is structural QA; it does NOT replace browser/mobile visual testing.
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const locales={"pt-br":"pt-BR",en:"en",es:"es"};
const pages=["index.html","privacy.html","support.html","ecosystem.html"];
const errors=[];
let checks=0;
const assert=(pass,msg)=>{checks++;if(!pass)errors.push(msg)};
const load=relative=>{const p=path.join(root,relative);assert(fs.existsSync(p),"Missing "+relative);return fs.existsSync(p)?fs.readFileSync(p,"utf8"):""};
const rootHtml=load("index.html"),router=load("assets/locale-router.js"),css=load("assets/locale-site.css");
assert(rootHtml.includes('data-bgct-gateway="true"'),"Root language gateway absent");
assert(rootHtml.includes('name="robots" content="noindex,nofollow"'),"Root must remain noindex");
assert(router.includes('localStorage.setItem'),"Manual choice persistence missing");
assert(router.includes('navigator.languages'),"Browser language detection missing");
assert(router.includes('return"en"'),"EN fallback missing");
assert(css.includes("@media(max-width:680px)"),"Narrow mobile breakpoint absent");
assert(css.includes("a:focus-visible"),"Keyboard focus treatment absent");
for(const [locale,lang]of Object.entries(locales)){
 for(const file of pages){
  const relative=locale+"/"+file,html=load(relative);
  assert(html.includes('<html lang="'+lang+'">'),"Incorrect HTML language: "+relative);
  assert(html.includes('name="robots" content="noindex,nofollow"'),"Premature indexing: "+relative);
  assert(html.includes('rel="canonical"'),"Missing canonical: "+relative);
  assert(html.includes('hreflang="x-default"'),"Missing x-default: "+relative);
  assert(html.includes('href="../assets/locale-site.css"'),"Missing shared style: "+relative);
  for(const [other,tag]of Object.entries(locales)){
   assert(html.includes('data-set-language="'+other+'"'),"Missing manual selection "+other+" in "+relative);
   assert(html.includes('hreflang="'+tag+'"'),"Missing hreflang "+tag+" in "+relative);
  }
  if(file==="index.html"){
   assert(html.includes('id="features"'),"Missing features: "+relative);
   assert(html.includes('id="how"'),"Missing how: "+relative);
   assert(!/href="https?:\/\/(?:chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i.test(html),"Premature store CTA: "+relative);
  }
  if(file==="privacy.html")assert((html.match(/<h2>/g)||[]).length===10,"Privacy sections incomplete: "+relative);
  if(file==="ecosystem.html")assert(!/blackgold-ecosystem\.pages\.dev|<a\\s[^>]*href="https?:\/\//.test(html),"Premature public ecosystem CTA: "+relative);
  for(const attr of ["href","src"]){
   for(const match of html.matchAll(new RegExp('\\b'+attr+'="([^"]+)"','g'))){
    const u=match[1];
    if(/^(https?:|mailto:|data:)/i.test(u))continue;
    const [base,hash]=u.split("#");
    if(!base){if(hash)assert(html.includes('id="'+hash+'"'),"Invalid local anchor "+u+" in "+relative);continue}
    const target=path.resolve(root,locale,base);
    assert(target.startsWith(root+path.sep),"Path escaped repo: "+u+" in "+relative);
    const resolved=(base.endsWith("/")?path.join(target,"index.html"):target);
    assert(fs.existsSync(resolved),"Broken "+attr+" "+u+" in "+relative);
    if(hash&&fs.existsSync(resolved))assert(fs.readFileSync(resolved,"utf8").includes('id="'+hash+'"'),"Broken anchor "+u+" in "+relative)
   }
  }
 }
}
if(errors.length){console.error("BGCT STATIC QA FAIL "+errors.length+" of "+checks);errors.forEach(x=>console.error(" - "+x));process.exitCode=1}
else console.log("BGCT STATIC QA PASS — "+checks+" checks, 3 locales, 12 localized pages; no deploy authorization.");
