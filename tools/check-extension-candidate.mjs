import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const root=path.resolve(import.meta.dirname,"..","extension-candidate");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const m=JSON.parse(read("manifest.json"));
assert.equal(m.manifest_version,3);
assert.equal(m.default_locale,"en");
assert.equal(m.version,"0.6.1");
assert.equal(m.version_name,"0.6.1-INTERNAL-CANDIDATE-DO-NOT-PUBLISH");
assert.deepEqual(m.permissions.slice().sort(),["activeTab","storage"].sort());
assert.equal(m.content_scripts.length,1);
assert.deepEqual(m.content_scripts[0].matches,["https://*.udemy.com/course/*/learn/*"]);
assert.equal(m.content_scripts[0].run_at,"document_idle");
assert.ok(!m.host_permissions&&!m.background&&!m.externally_connectable);
const paths=[m.action.default_popup,m.action.default_icon["128"],m.icons["128"],...m.content_scripts[0].js,...m.content_scripts[0].css,"popup.css","popup.js","icons/icon-128.png"];
for(const file of paths)assert.ok(fs.existsSync(path.join(root,file)),"Missing extension resource: "+file);
for(const file of [...m.content_scripts[0].js,"popup.js"])new vm.Script(read(file),{filename:file});
for(const locale of ["en","pt_BR","es"]){
 const dict=JSON.parse(read("_locales/"+locale+"/messages.json"));
 assert.equal(dict.extensionName?.message,"BlackGold Course Translator");
 assert.ok(dict.extensionDescription?.message);
 const other=fs.readFileSync(path.join(root,"..","extension-staging","_locales",locale,"messages.json"),"utf8");
 assert.equal(read("_locales/"+locale+"/messages.json"),other,"Locale must match tested staging source");
}
const icon=fs.readFileSync(path.join(root,"icons/icon-128.png"));
assert.deepEqual(Array.from(icon.subarray(0,8)),[137,80,78,71,13,10,26,10],"Extension icon is not valid PNG");
const script=read("content.js");
assert.ok(script.includes("session.activateFromGesture()"),"Model must start from in-page click");
assert.ok(script.includes("lastCue=null;sync();refresh()"),"First caption must be resubmitted after model activation");
assert.ok(script.includes("getVideo()"));
assert.ok(script.includes("textTracks"));
assert.ok(script.includes("data-purpose"));
assert.ok(script.includes("fullscreenchange"));
assert.ok(script.includes("session.setLesson(null)"),"Unsupported SPA route must release course data");
assert.ok(script.includes("isAllowedPage()"),"Route validation is URL-based rather than brittle string matching");
assert.ok(script.includes("chrome.runtime.onMessage.addListener"));
assert.ok(script.includes("caption.textContent=info.text"),"Caption must be safely rendered as text");
assert.ok(read("popup.html").includes('id="open"'));
assert.ok(read("popup.js").includes("chrome.tabs.sendMessage"));
assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(script+"\n"+read("popup.js")),"No remote analytics or API calls allowed");
assert.ok(!/\binnerHTML\s*=/.test(script),"Do not inject subtitle markup as HTML");
for(const lib of ["catalogs.js","locale-core.js","translator-api-adapter.js","caption-coordinator.js","session-controller.js"]){
 assert.equal(read("lib/"+lib),fs.readFileSync(path.join(root,"..","extension-staging",lib),"utf8"),"Staging library drift: "+lib);
}
console.log("BGCT MV3 CANDIDATE PASS: manifest, scoped pages, valid icon, locale assets, script parsing, library parity, click flow and privacy.");
