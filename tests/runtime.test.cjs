const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../dist/gw.js'), 'utf8');
const sent = [];
const handlers = {};
const element = { innerHTML: '', querySelectorAll: () => [] };
const wrap = {querySelectorAll:()=>[],querySelector:()=>({}),appendChild:()=>{}};
const sub = {textContent:'',remove:()=>{}};
const list = {querySelectorAll:()=>[],appendChild:()=>{}};
const buttons = {};
const document = {
  getElementById(id) {
    if(id==='gw-kapitel')return wrap;
    if(id==='gw-subtitle')return sub;
    if(id==='gw-sections')return list;
    if(id==='gw-regal')return wrap;
    if(id==='gw')return element;
    return buttons[id]||(buttons[id]={dataset:{},addEventListener:(event,fn)=>handlers[id]=fn});
  },
  createElement:()=>({style:{}}),
  querySelectorAll(selector) {
    if(selector!=='.gw-sq[data-p]')return [];
    const tag = element.innerHTML.match(/<button[^>]*data-a="chapter.create.open"[^>]*>/);
    if(!tag)return [];
    const prompt = tag[0].match(/data-p="([^"]*)"/)[1];
    return [{dataset:{p:prompt,a:'chapter.create.open'},addEventListener:(event,fn)=>handlers.create=fn}];
  }
};
const context={window:{},document,sendPrompt: text=>sent.push(text)};
vm.runInNewContext(src,context);
const GW=context.window.GW;
context.GW=GW;
const input={LANGUAGE:'en',HEAD_SHA:'a'.repeat(40),PROJECT_TITLE:'Beschreibung {{t:ui.description}} <img>',PROJECT_AUTHOR:'Autor',PROJECT_TITLE_SHORT:'Titel',CHAPTERS:[{CHAPTER_ID:'ch-1',CHAPTER_TITLE:'Kapitel',CHAPTER_STATUS:'approved',CHAPTER_NUMBER:1}]};
const before=JSON.stringify(input);
const english=GW.renderHtml('projektuebersicht',input);
assert.match(english,/Edit project details/);
assert.match(english,/Add a new chapter/);
assert.match(english,/finalized/);  // Status approved heißt sichtbar „finalized“ (#292)
assert.match(english,/Beschreibung \{\{t:ui.description\}\} &lt;img&gt;/);
assert.equal(JSON.stringify(input),before);
const german=GW.renderHtml('projektuebersicht',input,'de');
assert.match(german,/Projektdaten bearbeiten/);
assert.match(german,/abgeschlossen/);
assert.equal(GW.renderHtml('projektuebersicht',input,'fr'),german);
assert.equal(GW.renderHtml('projektuebersicht',input,'en-US'),english);
assert.equal(GW.supports('ki-dienste','en'),true);
assert.match(GW.renderHtml('ki-dienste',{},'en'),/Your services/);
assert.equal(GW.supports('ki-dienste','de'),true);
for(const name of ['projektuebersicht','buecherregal','kapitelansicht']){
  const html=GW.renderHtml(name,{},'en');
  assert(!/\{\{t:/.test(html));
  GW.render(name,input,element,'en');
}
GW.render('projektuebersicht',input,element,'en');
handlers.create();
assert.match(sent.pop(),/^Add a new chapter\n/);
assert.match(GW.renderHtml('buecherregal',{},'en'),/New book/);
assert.match(GW.renderHtml('kapitelansicht',{},'en'),/Chapter goal/);
const raw={chapter_id:'ch-1'};
const action=GW.withHead('chapter.update',raw);
assert.equal(action.chapter_id,'ch-1');
assert.equal(action.expected_head_sha,'a'.repeat(40));
assert.equal(raw.expected_head_sha,undefined);
console.log('UI runtime: bilingual core views, fallback, escaping, actions and immutable input passed');

const nested=JSON.parse(JSON.stringify(input));nested.CHAPTERS[0].CHAPTER_TITLE='Literal {{PROJECT_TITLE}} {{t:ui.description}} <b>';
const nestedHtml=GW.renderHtml('projektuebersicht',nested,'en');
assert.match(nestedHtml,/Literal \{\{PROJECT_TITLE\}\} \{\{t:ui.description\}\} &lt;b&gt;/);
console.log('Repeated user data is never re-interpreted as a placeholder');

// Prüf-Tags (GhostWriter #331): data-gw-checks baut Tags aus JSON; fehlendes Feld oder leere Liste entfernt das Element.
{
  const made=[];
  context.document.createElement=()=>{const s={style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}};made.push(s);return s;};
  const node=(value)=>({value,removed:false,children:[],getAttribute(){return this.value;},remove(){this.removed=true;},appendChild(c){this.children.push(c);}});
  const ok=node(JSON.stringify([{CK_TAG:'L✓·',CK_TEXT:'Sprache: bestanden mit Hinweisen',CK_RESULT:'passed_with_notes',CK_STATE:'current',CK_REPORT:'editorial/lektorat.md'},
                                {CK_TAG:'K✗*',CK_TEXT:'Korrektur <b>',CK_RESULT:'failed',CK_STATE:'changed'}]));
  const missing=node('{{CHAPTER_CHECKS_JSON}}'), empty=node('[]');
  const host={innerHTML:'',querySelectorAll:sel=>sel==='[data-gw-checks]'?[ok,missing,empty]:[]};
  GW.render('projektuebersicht',{CHAPTERS:[]},host,'de');
  assert.equal(ok.children.length,2);
  assert.equal(ok.children[0].textContent,'L✓·');
  assert.equal(ok.children[0].title,'Sprache: bestanden mit Hinweisen\neditorial/lektorat.md');
  assert.equal(ok.children[1].textContent,'K✗*');
  assert.equal(ok.children[1].attrs['data-result'],'failed');
  assert.match(ok.children[1].style.cssText,/dashed/);
  assert.match(ok.children[1].style.cssText,/--bg-warning/);
  assert.equal(ok.removed,false);
  assert.equal(missing.removed,true);
  assert.equal(empty.removed,true);
  const html=GW.renderHtml('kapitelansicht',{CHECKS_JSON:'[{"CK_TAG":"S✓"}]',SECTIONS:[{SECTION_ID:'s1',SECTION_CHECKS_JSON:'[{"CK_TAG":"L✓"}]'}]},'de');
  assert.match(html,/data-gw-checks="\[\{&quot;CK_TAG&quot;:&quot;L✓&quot;\}\]"/);
  assert.match(html,/Prüfungen/);
  console.log('Check tags: JSON rendering, tooltips, failed/changed styling and missing fields passed');
}
