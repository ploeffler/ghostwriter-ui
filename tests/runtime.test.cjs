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
// GhostWriter #179: alle schreibenden Aktionen tragen den gelesenen Stand, reine Aufträge und Ansichten nicht
for(const name of ['chapter.sections.add','chapter.research.start','series.volume.add','series.omnibus.publish','import.apply','analysis.apply','character.suggest.apply','image.place'])
  assert.equal(GW.withHead(name,{}).expected_head_sha,'a'.repeat(40),name);
for(const name of ['run.start','edition.proof','edition.create','view.section','form.cancel','character.suggest'])
  assert.equal(GW.withHead(name,{}).expected_head_sha,undefined,name);
assert.ok(GW.writes.includes('changes.merge'));
console.log('UI runtime: bilingual core views, fallback, escaping, actions and immutable input passed');

const nested=JSON.parse(JSON.stringify(input));nested.CHAPTERS[0].CHAPTER_TITLE='Literal {{PROJECT_TITLE}} {{t:ui.description}} <b>';
const nestedHtml=GW.renderHtml('projektuebersicht',nested,'en');
assert.match(nestedHtml,/Literal \{\{PROJECT_TITLE\}\} \{\{t:ui.description\}\} &lt;b&gt;/);
console.log('Repeated user data is never re-interpreted as a placeholder');

// Prüf-Tags (GhostWriter #331): data-gw-checks baut Tags aus JSON; fehlendes Feld oder leere Liste entfernt das Element.
{
  const made=[];
  context.document.createElement=()=>{const s={style:{},attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},appendChild(c){this.children.push(c);}};made.push(s);return s;};
  const node=(value)=>({value,removed:false,children:[],getAttribute(){return this.value;},removeAttribute(){this.value=null;},closest(){return null;},remove(){this.removed=true;},appendChild(c){this.children.push(c);}});
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
  assert.match(ok.children[1].style.cssText,/--bg-danger/);
  assert.match(ok.children[0].style.cssText,/--bg-warning/);
  assert.equal(ok.removed,false);
  assert.equal(missing.removed,true);
  assert.equal(empty.removed,true);
  // #340: Klartext-Tag wie bei den Markern; Verlauf nach Prüfart gruppiert, je Eintrag Datum und Uhrzeit
  {const pill=node(JSON.stringify([{CK_TAG:'Q✓·',CK_PILL:'Qualität ✓·',CK_RESULT:'passed_with_notes',CK_STATE:'current'}]));
   const hist=node(JSON.stringify([{CK_LABEL:'Qualität',CK_WHEN:'2026-11-19 14:05',CK_MARK:'✗',CK_RESULT:'failed',CK_STATE:'changed'},
                                   {CK_LABEL:'Sprache',CK_WHEN:'2026-11-18',CK_MARK:'✓',CK_RESULT:'passed',CK_STATE:'current'},
                                   {CK_LABEL:'Qualität',CK_WHEN:'2026-11-18 09:00',CK_MARK:'?',CK_RESULT:'unknown',CK_STATE:'unknown'}]));
   const h2={innerHTML:'',querySelectorAll:sel=>sel==='[data-gw-checks]'?[pill]:sel==='[data-gw-checks-history]'?[hist]:[]};
   GW.render('projektuebersicht',{CHAPTERS:[]},h2,'de');
   assert.equal(pill.children.length,1);
   assert.equal(pill.value,null);   // Attribut entfernt: kein zweiter Durchlauf
   assert.equal(pill.children[0].textContent,'Qualität ✓·');
   assert.equal(hist.children.length,2);
   const q=hist.children[0].children;
   assert.equal(q[0].textContent,'Qualität');
   assert.deepEqual(q[1].children.map(c=>c.textContent),['2026-11-19 14:05 ✗*','2026-11-18 09:00 ?']);}
  {const h=GW.renderHtml('kapitelansicht',{CHECKS_HISTORY_JSON:'[{"CK_TAG":"Q✗"}]',CHECKS_HISTORY_COUNT:'1'},'de');
   assert.ok(h.includes('Frühere Prüfungen (1)')&&h.includes('data-gw-checks-history'));}
  const html=GW.renderHtml('kapitelansicht',{CHECKS_JSON:'[{"CK_TAG":"S✓"}]',SECTIONS:[{SECTION_ID:'s1',SECTION_CHECKS_JSON:'[{"CK_TAG":"L✓"}]'}]},'de');
  assert.match(html,/data-gw-checks="\[\{&quot;CK_TAG&quot;:&quot;L✓&quot;\}\]"/);
  assert.match(html,/Prüfungen/);
  console.log('Check tags: JSON rendering, tooltips, failed/changed styling and missing fields passed');
}
// Knopf mit Rückfrage (GhostWriter #352): Vorabfassung im Formular „Neue Auflage“
{
  const html=GW.renderHtml('auflage-erzeugen',{PREVIEW_TAG:'mein-buch-vorab-2',FORMATS:[]},'de');
  assert.match(html,/data-gw-send="edition.preview"/);
  assert.match(html,/data-gw-confirm="Die Vorabfassung legt den Tag mein-buch-vorab-2 und ein Pre-Release/);
  assert.ok(GW.renderHtml('auflage-erzeugen',{PREVIEW_TAG:'x-vorab-1',FORMATS:[]},'en').includes('Click again to create it.'));
  const overview=GW.renderHtml('projektuebersicht',{PREVIEW_TEXT:'Vorabfassung 2 vom 19.11.2026',PREVIEW_URL:'https://github.com/o/r/releases/tag/t-vorab-2',CHAPTERS:[]},'de');
  assert.match(overview,/href="https:\/\/github.com\/o\/r\/releases\/tag\/t-vorab-2"[^>]*>.*Vorabfassung 2 vom 19.11.2026<\/a>/);
  const out=[];context.sendPrompt=t=>out.push(t);
  const inserted=[];
  const label={nodeType:3,textContent:'Vorabfassung'};
  const row={parentNode:{insertBefore(box,before){inserted.push([box,before]);}}};
  const attrs={'data-gw-send':'edition.preview','data-gw-text':'Vorabfassung anlegen','data-gw-confirm':'Legt den Tag t-vorab-2 an.','data-gw-confirm-label':'Ja, anlegen','data-gw-done':'angefordert'};
  const btn={disabled:false,lastChild:label,parentNode:{},getAttribute:k=>attrs[k]||null,closest:()=>row,handlers:{},addEventListener(e,fn){this.handlers[e]=fn;}};
  const plain={disabled:false,lastChild:{nodeType:3,textContent:'x'},parentNode:row,getAttribute:k=>({'data-gw-send':'edition.proof','data-gw-args':'{"formats":"pdf"}'})[k]||null,closest:()=>null,handlers:{},addEventListener(e,fn){this.handlers[e]=fn;}};
  context.document.createElement=()=>({style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;}});
  const host={innerHTML:'',querySelectorAll:sel=>sel==='[data-gw-send]'?[btn,plain]:[]};
  const getById=context.document.getElementById;
  context.document.getElementById=()=>({textContent:'Hinweis',dataset:{},addEventListener(){},remove(){},querySelectorAll:()=>[]});
  GW.render('auflage-erzeugen',{PREVIEW_TAG:'t-vorab-2',FORMATS:[]},host,'de');
  context.document.getElementById=getById;
  btn.handlers.click();
  assert.equal(out.length,0,'erster Klick sendet nicht');
  assert.equal(inserted.length,1);
  assert.equal(inserted[0][0].textContent,'Legt den Tag t-vorab-2 an.');
  assert.equal(inserted[0][1],row);
  assert.equal(label.textContent,'Ja, anlegen');
  btn.handlers.click();
  assert.equal(out.length,1);
  assert.match(out[0],/^Vorabfassung anlegen\n\n`gw:edition.preview`$/);
  assert.equal(btn.disabled,true);
  assert.equal(label.textContent,'angefordert');
  btn.handlers.click();
  assert.equal(out.length,1,'gesperrt nach dem Senden');
  plain.handlers.click();
  assert.match(out[1],/`gw:edition.proof formats=pdf`$/);
  console.log('Confirm buttons: preview needs a second click, sends once, shows tag and release link');
}
// Zeitleiste (GhostWriter #354): Hinweise als Block, Daten als JSON-Attribut, Knopf in der Projektübersicht
{
  const json=JSON.stringify({entries:[{id:'chr-001',kind:'event',lo:'1944-01-01',hi:'1944-12-31',label:'um 1944',what:'<b>Flucht</b>',status:'reported',lanes:['@none']}],lanes:[{key:'@none',label:'Ohne Figur'}],chapters:[]});
  const html=GW.renderHtml('zeitleiste',{COUNT_TEXT:'1 Eintrag',TIMELINE_JSON:json,FINDINGS:[{F_KIND_TEXT:'zwei Daten',F_TEXT:'„Flucht“: 1944 und 1945',F_ENTRIES:'chr-001, chr-002'}]},'de');
  assert.match(html,/Wo die Daten nicht zusammenpassen/);
  assert.match(html,/zwei Daten: „Flucht“: 1944 und 1945/);
  assert.ok(html.includes('data-json="{&quot;entries&quot;'));
  assert.ok(!html.includes('<b>Flucht</b>'));
  assert.match(GW.renderHtml('zeitleiste',{TIMELINE_JSON:'{}'},'en'),/Where the dates do not fit together|Timeline/);
  const ov=GW.renderHtml('projektuebersicht',{CHAPTERS:[],CHRONOLOGY_TEXT:'Chronologie: 3 Einträge, 1 Hinweis'},'de');
  assert.match(ov,/data-a="view.timeline"/);
  assert.match(ov,/Chronologie: 3 Einträge, 1 Hinweis/);
  console.log('Timeline: findings, escaped JSON data and overview button passed');
}
// Hinweisdurchsicht (GhostWriter #367): Gruppen, Maskierung, Entscheidungen einzeln senden
{
  const data={REVIEW_FILE:'editorial/durchsicht-2026-11-20.yml',REVIEW_BOOK:'Buch',REVIEW_DATE_TEXT:'Stand 20.11.2026',REVIEW_COUNT_TEXT:'2 Einträge',
    AUTO:[{E_ID:'e-001',E_WHERE:'1.1',E_KIND:'rechtschreibung',E_REASON:'Tippfehler',E_OLD:'<i>Hause</i>',E_NEW:'Haus',E_CONTEXT:'Er ging nach Hause.',E_DECISION:'offen'}],
    AUTHOR:[{E_ID:'e-002',E_WHERE:'1.2',E_KIND:'ton',E_REASON:'zu flapsig',E_QUESTION:'Sachlicher?',E_NEW:'',E_DECISION:'ja'}],
    SKIPPED:[{SK_REF:'editorial/x.yml#b-003',SK_REASON:'kommt 2-mal vor'}]};
  const html=GW.renderHtml('hinweisdurchsicht',data,'de');
  assert.match(html,/Ohne Autor lösbar/);assert.match(html,/Autorenentscheidung/);assert.match(html,/Sachlicher\?/);
  assert.ok(!html.includes('<i>Hause</i>'));assert.match(html,/kommt 2-mal vor/);
  assert.match(GW.renderHtml('hinweisdurchsicht',data,'en'),/Solvable without the author/);
  const src=fs.readFileSync(path.join(__dirname,'../templates/hinweisdurchsicht.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const sent=[];
  function node(ds){const h={},kids={};const n={dataset:ds||{},disabled:false,classList:{add(){n.done=true;}},textContent:'',
    addEventListener:(t,f)=>{h[t]=f;},click:()=>h.click&&h.click(),remove(){n.removed=true;},before(x){n.inserted=x;},focus(){},
    querySelector:s=>kids[s]||null,querySelectorAll:s=>kids['*'+s]||[]};n.kids=kids;return n;}
  function item(id,decision,neu){const it=node({id,decision,new:neu});const bs=['ja','nein','geändert'].map(d=>node({d}));
    const act=node();act.before=x=>{it.kids[x.dataset&&x.dataset.q?'textarea[data-q]':'textarea:not([data-q])']=x;};it.kids['.act']=act;it.kids['.st']=node();
    it.kids['*button[data-d]']=bs;it.kids['*button,textarea']=bs;it.kids['*[data-opt="new"]']=[];it.btn=d=>bs[['ja','nein','geändert'].indexOf(d)];it.ask=node();it.kids['button[data-ask]']=it.ask;return it;}
  const a=item('e-001','offen','Haus'),b=item('e-002','ja',''),c=item('e-003','offen','');
  const box=node({file:'editorial/durchsicht-2026-11-20.yml'});box.kids['*.it']=[a,b,c];
  const plan=node();
  vm.runInNewContext(src+';',{document:{getElementById:id=>id==='gw-nr'?box:id==='gw-plan'?plan:null,createElement:()=>{const t=node();t.value='';return t;}},
    GW:{withHead:(x,d)=>d},tr:(k,a)=>k+(a?JSON.stringify(a):''),sendPrompt:s=>sent.push(s)});
  a.btn('ja').click();
  assert.match(sent[0],/`gw:notes_review.decide file=editorial\/durchsicht-2026-11-20.yml entry=e-001 decision=ja`/);
  b.btn('nein').click();assert.equal(sent.length,1);   // schon entschieden: keine Bindung
  c.btn('geändert').click();assert.equal(sent.length,1);   // erst Textfeld
  c.kids['textarea:not([data-q])'].value='Eigene Fassung';c.btn('geändert').click();
  assert.match(sent[1],/"action":"notes_review.decide".*"decision":"geändert".*"new":"Eigene Fassung"/);
  // Frage stellen (#609): erst Textfeld, dann notes_review.ask; nichts wird gesperrt oder entschieden
  const before=sent.length;a.ask.click();assert.equal(sent.length,before);
  a.kids['textarea[data-q]'].value='Wie lange segelt man von Trogir nach Triest?';a.ask.click();
  assert.equal(sent.length,before+1);assert.match(sent[before],/"action":"notes_review.ask".*"entry":"e-001".*"question":"Wie lange segelt man von Trogir nach Triest\?"/);
  plan.click();assert.match(sent[sent.length-1],/notes_review.plan file=/);
  console.log('Notes review: groups, escaping, one decision per click, rephrase needs text, plan button passed');
}
