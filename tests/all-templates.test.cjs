const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..');
const de=JSON.parse(fs.readFileSync(path.join(root,'i18n/de.json'),'utf8'));
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'dist/gw.js'),'utf8'),context);
const GW=context.window.GW;
assert.equal(GW.templates.length,38);
for(const name of GW.templates){
  assert.equal(GW.supports(name,'en'),true,name);
  const input={LANGUAGE:'en',SECTION_TITLE:'Titel {{PROJECT_TITLE}} <b>',MANUSCRIPT:'Noch nicht begonnen. {{t:ui.description}} <script>',TITLE:'Titel',CHAPTER_NUMBER:3,SECTION_NUMBER:'3.2'};
  const before=JSON.stringify(input);
  const html=GW.renderHtml(name,input,'en');
  assert(!/\{\{t:/.test(html),name);
  assert.equal(JSON.stringify(input),before,name);
  assert.equal(GW.renderHtml(name,input,'en-US'),html,name);
  assert.equal(GW.renderHtml(name,input,'fr'),GW.renderHtml(name,input,'de'),name);
  const source=fs.readFileSync(path.join(root,'templates',name+'.html'),'utf8');
  const script=source.match(/<script>([\s\S]*?)<\/script>/);
  if(script)new vm.Script('(function(tr){'+script[1]+'})');
}
// Die Sperre muss auch bei einem direkten Aufruf des Click-Handlers greifen.
function approval(blocked, revoke){
  const sent=[],handlers={},elements={};
  function el(){return {dataset:{},style:{},classList:{add(){}},querySelector:()=>el(),querySelectorAll:()=>[],addEventListener:(type,fn)=>{}};}
  for(const id of ['gw-freigabe','gw-save','gw-cancel','gw-icon','gw-blocked'])elements[id]=el();
  elements['gw-freigabe'].dataset={kind:'section',id:'sec-2',label:'Eigener Titel',title:'Approve section',revoke:String(revoke)};
  elements['gw-freigabe'].querySelectorAll=selector=>selector==='.gw-ck'?[{dataset:{state:blocked?'block':'ok'},querySelector:()=>el()}]:[];
  for(const id of ['gw-save','gw-cancel'])elements[id].addEventListener=(type,fn)=>handlers[id]=fn;
  const script=fs.readFileSync(path.join(root,'templates/freigabe-bestaetigen.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext('(function(tr){'+script+'})(tr)',{document:{getElementById:id=>elements[id]},GW:{withHead:(action,data)=>Object.assign({},data,{expected_head_sha:'abc123'})},tr:key=>JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json'),'utf8'))[key],sendPrompt:s=>sent.push(s)});
  handlers['gw-save']();
  if(blocked){assert.equal(sent.length,0);assert.equal(elements['gw-save'].disabled,true);}
  else {assert.match(sent[0],/approval.confirm/);assert.match(sent[0],/section_id=sec-2/);assert.match(sent[0],/expected_head_sha=abc123/);if(revoke)assert.match(sent[0],/revoke=true/);}
}
approval(true,false);approval(false,false);approval(false,true);
console.log('All 38 bilingual templates: compilation, fallback, immutable data and approval gates passed');
// Rückübersetzung ausschließlich der Quelltextliterale: IDs, Selektoren,
// Bedingungen, strukturierte Aktionen und Freigaberegeln müssen identisch bleiben.
const crypto=require('node:crypto');
const contracts=JSON.parse(fs.readFileSync(path.join(__dirname,'action-contracts.json'),'utf8'));
const normalize=source=>source.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,literal=>JSON.stringify(vm.runInNewContext(literal))).replace(/\s+/g,' ');
for(const [name,expected] of Object.entries(contracts)){
  const source=fs.readFileSync(path.join(root,'templates',name+'.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const restored=source.replace(/tr\("([a-z0-9_.]+)"\)/g,(match,key)=>JSON.stringify(de[key]));
  assert.equal(crypto.createHash('sha256').update(normalize(restored)).digest('hex'),expected,'Action logic changed: '+name);
}
console.log('All 30 migrated script contracts preserve the original action logic');
