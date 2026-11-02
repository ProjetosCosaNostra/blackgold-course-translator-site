import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
const folder=path.resolve(import.meta.dirname,"..");
const source=f=>fs.readFileSync(path.join(folder,f),"utf8");
const lang=["en","pt_BR","es"];
const all=Object.fromEntries(lang.map(l=>[l,JSON.parse(source("extension-staging/_locales/"+l+"/messages.json"))]));
const primary=Object.keys(all.en).sort();
for(const l of lang){
 assert.deepEqual(Object.keys(all[l]).sort(),primary,"All locales must have identical keys");
 for(const [key,item]of Object.entries(all[l])){
  assert.equal(typeof item.message,"string",l+":"+key);
  assert.ok(item.message.trim(),l+":"+key+" empty");
  if(item.message.includes("$PERCENT$")){
   assert.deepEqual(item.placeholders,{percent:{content:"$1"}},l+":"+key+" placeholder");
  }
 }
 assert.equal(all[l].extensionName.message,"BlackGold Course Translator");
}
const context={};vm.createContext(context);
vm.runInContext(source("extension-staging/catalogs.js"),context,{filename:"catalogs.js"});
vm.runInContext(source("extension-staging/locale-core.js"),context,{filename:"locale-core.js"});
const api=context.BGCT_STAGING_LOCALE;
assert.ok(api,"Global i18n helper missing");
assert.equal(api.normalize("pt-BR"),"pt_BR");
assert.equal(api.normalize("es-MX"),"es");
assert.equal(api.normalize("EN-us"),"en");
assert.equal(api.normalize("fr-FR"),null);
assert.equal(api.resolve("es",["pt-BR"]),"es","Manual choice must win");
assert.equal(api.resolve(null,["fr-FR","pt-BR"]),"pt_BR");
assert.equal(api.resolve(null,["fr-FR"]),"en");
assert.equal(api.message("statusApiUnavailable","pt_BR"),"API indisponível");
assert.equal(api.status("pair-unavailable",null,"pt_BR"),"Par não suportado");
assert.equal(api.status("downloading",42,"es"),"Descargando 42%");
assert.equal(api.status("downloading",250,"en"),"Downloading 100%");
assert.equal(api.status("ready",null,"en"),"Ready ✓");
assert.equal(api.status("unknown",null,"en"),"Preparing...");
assert.equal(api.message("missing","en"),"");
for(const l of lang){
 for(const k of primary){
  assert.equal(api.message(k,l,{percent:50}),all[l][k].message.replace("$PERCENT$","50"),"Mismatch in runtime and manifest catalog "+l+":"+k);
 }
}
const fakeStorage={store:{},async get(keys){return {[keys[0]]:this.store[keys[0]]}},async set(obj){Object.assign(this.store,obj)}};
assert.equal(await api.getSaved(fakeStorage),null);
assert.equal(await api.save(fakeStorage,"pt-BR"),true);
assert.equal(await api.getSaved(fakeStorage),"pt_BR");
assert.equal(await api.save(fakeStorage,"zz"),false);
assert.equal(await api.getSaved(fakeStorage),"pt_BR");
console.log("BGCT EXTENSION I18N STAGING PASS: 3 locales, "+primary.length+" keys, locale precedence, status values, placeholders, storage.");
