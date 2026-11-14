const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/gw.js'),'utf8');
function payload(text){
  const block=text.match(/```gw\n([\s\S]*?)\n```$/);
  if(block)return JSON.parse(block[1]);
  const short=text.match(/`gw:([^\s`]+)([^`]*)`$/);
  assert(short,'Missing structured action');
  const result={action:short[1]};
  short[2].trim().split(/\s+/).filter(Boolean).forEach(token=>{const i=token.indexOf('=');result[token.slice(0,i)]=token.slice(i+1);});
  return result;
}
function mount(name,seed={}){
  const nodes={},sent=[];
  const element={innerHTML:'',querySelectorAll:()=>[]};
  function node(id){
    if(nodes[id])return nodes[id];
    const n={value:seed[id]===undefined?'':seed[id],textContent:'',hidden:true,disabled:false,selectedIndex:1,dataset:{chapter:'ch-stable',num:'2',prefix:'buch/',fc:'requested'},style:{},handlers:{},focus(){this.focused=true;},setAttribute(k,v){this[k]=v;},addEventListener(e,fn){this.handlers[e]=fn;},querySelectorAll(selector){return selector==='li'?(seed.taken||[]):[];}};
    nodes[id]=n;return n;
  }
  const document={getElementById:node,querySelectorAll:()=>[]};
  const ctx={window:{},document,sendPrompt:text=>sent.push(text)};
  vm.runInNewContext(source,ctx);ctx.GW=ctx.window.GW;
  ctx.GW.render(name,{LANGUAGE:'en',HEAD_SHA:'b'.repeat(40),CHAPTER_ID:'ch-stable',CHAPTER_NUMBER:2,BRANCH_PREFIX:'buch/',POSITIONS:[{POSITION_LABEL:'After chapter 1 “Deutscher Titel”',POSITION_SELECTED:'selected'}]},element,'en');
  return {nodes,sent,node,html:element.innerHTML,GW:ctx.GW};
}
for(const [name,action] of [['kapitel-anlegen','chapter.create'],['kapitel-bearbeiten','chapter.update'],['abschnitt-anlegen','section.create'],['projektdaten-bearbeiten','project.update']]){
  const m=mount(name,{'gw-title':'Deutscher Titel','gw-summary':'Deutsche Zusammenfassung','gw-goal':'Deutsches Ziel','gw-pos':'After chapter 1 “Deutscher Titel”'});
  assert.match(m.html,/Please enter a title/);
  m.node('gw-save').handlers.click();
  assert.equal(m.sent.length,1);
  const data=payload(m.sent[0]);
  assert.equal(data.action,action);
  assert.equal(data.title,'Deutscher Titel');
  assert.equal(data.expected_head_sha,'b'.repeat(40));
  if(action==='section.create'){
    assert.equal(data.chapter_id,'ch-stable');
    assert.equal(data.fact_check,'requested');
    assert.equal(data.position,1);
    assert.match(m.html,/value="disabled">off/);
  }
  if(action==='chapter.create')assert.equal(data.position,1);
  if(action==='chapter.update')assert.equal(data.chapter_id,'ch-stable');
  assert(!/Projektdaten speichern|Neues Kapitel anlegen|Neuer Abschnitt in Kapitel/.test(m.sent[0]));
  const invalid=mount(name);
  invalid.node('gw-save').handlers.click();
  assert.equal(invalid.sent.length,0);
  assert.equal(invalid.node('gw-title-err').hidden,false);
  invalid.node('gw-cancel').handlers.click();
  assert.equal(payload(invalid.sent[0]).action,'form.cancel');
}
// Buchangaben in den Projektdaten (GhostWriter #299)
const pd=mount('projektdaten-bearbeiten',{'gw-title':'Titel','gw-subtitle':'Ein Untertitel','gw-lang':'de-AT','gw-type':'Roman','gw-audience':'Erwachsene','gw-trans':'en, fr'});
pd.node('gw-save').handlers.click();
const pdData=payload(pd.sent[0]);
assert.equal(pdData.subtitle,'Ein Untertitel');
assert.equal(pdData.language,'de-AT');
assert.equal(pdData.book_type,'Roman');
assert.equal(pdData.target_audience,'Erwachsene');
assert.deepEqual(pdData.translations_planned,['en','fr']);
assert.match(pd.html,/Planned translations/);
const pdBad=mount('projektdaten-bearbeiten',{'gw-title':'Titel','gw-lang':'Deutsch'});
pdBad.node('gw-save').handlers.click();
assert.equal(pdBad.sent.length,0);
assert.equal(pdBad.node('gw-lang-err').hidden,false);
const pdBadTrans=mount('projektdaten-bearbeiten',{'gw-title':'Titel','gw-trans':'englisch'});
pdBadTrans.node('gw-save').handlers.click();
assert.equal(pdBadTrans.sent.length,0);
assert.equal(pdBadTrans.node('gw-trans-err').hidden,false);
const pdTransRegion=mount('projektdaten-bearbeiten',{'gw-title':'Titel','gw-trans':'en-gb'});
pdTransRegion.node('gw-save').handlers.click();
assert.equal(pdTransRegion.sent.length,0);
const pdTransOk=mount('projektdaten-bearbeiten',{'gw-title':'Titel','gw-trans':'en-GB'});
pdTransOk.node('gw-save').handlers.click();
assert.deepEqual(payload(pdTransOk.sent[0]).translations_planned,['en-GB']);
const pdEmpty=mount('projektdaten-bearbeiten',{'gw-title':'Titel'});
pdEmpty.node('gw-save').handlers.click();
assert.deepEqual(payload(pdEmpty.sent[0]).translations_planned,[]);
// Analyse-Einstellungen (GhostWriter #299)
const an=mount('analyse-einstellungen',{'gw-model':'mini','gw-pin':'0,25','gw-pout':'2','gw-par':'6','gw-ltlang':'de-AT','gw-words':'Opa Karl\nOpa Karl\n\nHuber','gw-rules':'DE_CASE'});
assert.match(an.html,/Analysis settings/);
assert.match(an.html,/GitHub secrets/);
an.node('gw-provider').value='openai';
an.node('gw-save').handlers.click();
const anData=payload(an.sent[0]);
assert.equal(anData.action,'project.analysis.update');
assert.equal(anData.provider,'openai');
assert.equal(anData.model,'mini');
assert.equal(anData.merge_model,'');
assert.equal(anData.price_input_per_mtok,0.25);
assert.equal(anData.price_output_per_mtok,2);
assert.equal(anData.parallel,6);
assert.deepEqual(anData.languagetool,{language:'de-AT',words:['Opa Karl','Huber'],disabled_rules:['DE_CASE']});
assert.equal(anData.expected_head_sha,'b'.repeat(40));
const anEmpty=mount('analyse-einstellungen');
anEmpty.node('gw-save').handlers.click();
const anEmptyData=payload(anEmpty.sent[0]);
assert.equal(anEmptyData.price_input_per_mtok,null);
assert.equal(anEmptyData.parallel,null);
assert.deepEqual(anEmptyData.languagetool.words,[]);
for(const [field,value] of [['gw-pin','-1'],['gw-pout','zwei'],['gw-par','20'],['gw-par','2.5'],['gw-ltlang','Deutsch']]){
  const bad=mount('analyse-einstellungen',{[field]:value});
  bad.node('gw-save').handlers.click();
  assert.equal(bad.sent.length,0,field+'='+value);
  assert.equal(bad.node(field+'-err').hidden,false);
}
const anCancel=mount('analyse-einstellungen');
anCancel.node('gw-cancel').handlers.click();
assert.equal(payload(anCancel.sent[0]).action,'form.cancel');
const book=mount('buch-anlegen',{'gw-wt':'Überraschung für Groß','gw-author':'Deutscher Autor'});
book.node('gw-create').handlers.click();
const data=payload(book.sent[0]);
assert.equal(data.action,'library.book.create');
assert.equal(data.working_title,'Überraschung für Groß');
assert.equal(data.branch,'buch/ueberraschung-fuer-gross');
assert.equal(data.author,'Deutscher Autor');
assert.equal(data.expected_head_sha,'b'.repeat(40));
assert.match(book.sent[0],/^Create a new book:/);
const duplicate=mount('buch-anlegen',{'gw-wt':'Schon da',taken:[{dataset:{slug:'schon-da',branch:'buch/schon-da'}}]});
assert.equal(duplicate.node('gw-create').disabled,true);
assert.match(duplicate.node('gw-short-err').textContent,/already exists/);
duplicate.node('gw-create').handlers.click();
assert.equal(duplicate.sent.length,0);
const empty=mount('buch-anlegen');empty.node('gw-create').handlers.click();assert.equal(empty.sent.length,0);assert.equal(empty.node('gw-wt-err').hidden,false);
empty.node('gw-cancel').handlers.click();assert.equal(payload(empty.sent[0]).action,'form.cancel');
console.log('Five English forms: required fields, duplicates, slugs, cancel, raw values and expected_head_sha passed');
