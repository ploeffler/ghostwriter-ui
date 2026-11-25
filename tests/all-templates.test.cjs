const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..');
const de=JSON.parse(fs.readFileSync(path.join(root,'i18n/de.json'),'utf8'));
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'dist/gw.js'),'utf8'),context);
const GW=context.window.GW;
assert.equal(GW.templates.length,46);
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
// Alle Einstellungen (GhostWriter #299): Zeilen als JSON im Attribut, maskiert, nie als HTML eingesetzt.
{
  const rows=JSON.stringify([{key:'typesetting.font','label':'','value':'<b>x</b> "q"',origin:'book',origin_text:'eigener Wert',differs:true,form_text:'Ausgabe'}]);
  const html=GW.renderHtml('einstellungen',{SETTINGS_TITLE:'Alle Einstellungen',SETTINGS_INTRO:'1',SETTINGS_KIND:'book',GROUPS:[{G_KEY:'typesetting',G_TITLE:'Buchsatz',G_ROWS:rows}]},'de');
  assert(!html.includes('<b>x</b>'));
  assert(html.includes('data-rows="'));
  const attr=html.match(/data-rows="([^"]*)"/)[1].replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  assert.equal(JSON.parse(attr)[0].value,'<b>x</b> "q"');
}
// Hintergrund-Warteschlange (GhostWriter #478): drei Gruppen, Argumente maskiert, Leerzustand
{
  const row={J_TITLE:'Recherche · 2.1 <b>Titel</b>',J_DETAIL:'Frage "x"',J_STATE_TEXT:'wartet',J_WHEN_TEXT:'22.11., 20:00',J_PRIORITY_TEXT:'',J_BLOCKED_TEXT:'',J_NOTE:'',J_PRIO_DISABLED:'',J_ARGS:JSON.stringify({request:'chapters/ch-01/research/s-1/request-001.yml'})};
  const html=GW.renderHtml('warteschlange',{QUEUE_BOOK:'Buch',QUEUE_COUNT_TEXT:'2 Aufträge',PENDING:[row,Object.assign({},row,{J_PRIO_DISABLED:'disabled'})],FAILED:[{J_TITLE:'Analyse',J_DETAIL:'Anbieter antwortet nicht',J_WHEN_TEXT:''}],DONE:[]},'de');
  assert(!html.includes('<b>Titel</b>'));
  assert.equal((html.match(/data-gw-send="queue.prioritize"/g)||[]).length,2);
  assert.equal((html.match(/data-gw-send="queue.cancel"/g)||[]).length,2);
  assert(html.includes('data-gw-confirm="'));
  assert(html.includes('disabled data-gw-send="queue.prioritize"'));
  const arg=html.match(/data-gw-args="([^"]*)"/)[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&');
  assert.equal(JSON.parse(arg).request,'chapters/ch-01/research/s-1/request-001.yml');
  assert(html.includes('Anbieter antwortet nicht'));
  const en=GW.renderHtml('warteschlange',{QUEUE_EMPTY:'1',QUEUE_BOOK:'Book',QUEUE_COUNT_TEXT:'no jobs'},'en');
  assert(en.includes('Background queue')&&en.includes('No jobs in the queue.'));
}
console.log('All 46 bilingual templates: compilation, fallback, immutable data and approval gates passed');
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
