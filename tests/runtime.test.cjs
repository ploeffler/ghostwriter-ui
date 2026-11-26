const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../dist/gw.js'), 'utf8');
const {parseMessage:P}=require('./helpers.cjs');
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
  // Kompakte Prüf-Listen (GhostWriter #674, 0.74.0): echtes JSON im Platzhalter, gepackte Zeilen mit Berichtsindex, Texte aus den Sprachdateien
  {const html2=GW.renderHtml('kapitelansicht',{CHECKS_JSON:[{CK_SHORT:'S',CK_LABEL:'Struktur',CK_RESULT:'passed'}]},'de');
   assert.match(html2,/data-gw-checks="\[\{&quot;CK_SHORT&quot;:&quot;S&quot;/);   // Array als JSON-Text, nicht als [object Object]
   for(const [lang,expect] of [['de','Struktur: bestanden mit Hinweisen, 2026-11-20 10:00 \u00b7 seit Prüfung geändert \u00b7 teilweise'],['en','Structure: passed with notes, 2026-11-20 10:00 \u00b7 changed since check \u00b7 partial']]){
     const packed=node(JSON.stringify({k:['CK_SHORT','CK_LABEL','CK_RESULT','CK_STATE','CK_WHEN','CK_PARTIAL','CK_REPORT'],
       r:[['S',lang==='de'?'Struktur':'Structure','passed_with_notes','changed','2026-11-20 10:00',true,0],['L',lang==='de'?'Sprache':'Language','failed','current','2026-11-21',false,0],['K','Korr','passed','unknown','2026-11-22',false,1]],
       p:['editorial/a.md','editorial/b.md']}));
     const host3={innerHTML:'',querySelectorAll:sel=>sel==='[data-gw-checks]'?[packed]:[]};
     GW.render('projektuebersicht',{CHAPTERS:[]},host3,lang);
     const c=packed.children;
     assert.equal(c.length,3);
     assert.equal(c[0].textContent,'S\u2713\u00b7*');                       // CK_TAG aus Kürzel, Ergebnis und Stand
     assert.equal(c[0].title,expect+'\neditorial/a.md');                    // CK_TEXT aus den Sprachdateien, Bericht über den Index
     assert.equal(c[1].textContent,'L\u2717');
     assert.equal(c[2].textContent,'K\u2713?');
     assert.equal(c[2].title.endsWith('\neditorial/b.md'),true);
     assert.equal(c[0].attrs['data-result'],'passed_with_notes');}}
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
// v0.69.0 (GhostWriter #592, #593, #572, #596): Markieren mit Grund, leere Aktion, Handlungsbedarf, Marken, Checkouts, Erneut versuchen
{
  const sent=[];context.sendPrompt=t=>sent.push(t);
  const made=[];
  context.document.createElement=()=>{const t={style:{},attrs:{},value:'',disabled:false,setAttribute(k,v){this.attrs[k]=v;},focus(){}};made.push(t);return t;};
  const parent={insertBefore(x){this.inserted=x;}};
  const label={nodeType:3,textContent:'Als veraltet markieren'};
  const attrs={'data-gw-send':'section.mark_stale','data-gw-args':'{"section_id":"sec-01-01"}','data-gw-input':'reason','data-gw-input-placeholder':'Grund','data-gw-confirm-label':'Markieren','data-gw-text':'Als veraltet markieren','data-gw-done':'angefordert'};
  const mark={disabled:false,lastChild:label,parentNode:parent,getAttribute:k=>attrs[k]||null,hasAttribute:()=>false,closest:()=>null,handlers:{},addEventListener(e,fn){this.handlers[e]=fn;}};
  const noAction={disabled:false,getAttribute:()=>null,hasAttribute:k=>k==='data-gw-optional',removed:false,remove(){this.removed=true;},addEventListener(){}};
  const plainEmpty={disabled:false,getAttribute:()=>null,hasAttribute:()=>false,addEventListener(){}};
  const host={innerHTML:'',querySelectorAll:sel=>sel==='[data-gw-send]'?[mark,noAction,plainEmpty]:[]};
  const getById=context.document.getElementById;
  context.document.getElementById=()=>({textContent:'',dataset:{},addEventListener(){},remove(){},querySelectorAll:()=>[]});
  GW.render('abschnitt-bearbeiten',{SECTION_ID:'sec-01-01',STALE_NONE:'1',STALE_ARGS:'{"section_id":"sec-01-01"}'},host,'de');
  context.document.getElementById=getById;
  assert.equal(noAction.removed,true,'optionaler Knopf ohne Aktion entfällt');
  assert.equal(plainEmpty.disabled,true,'Knopf ohne Aktion ist nicht klickbar');
  mark.handlers.click();
  assert.equal(sent.length,0,'erster Klick zeigt nur das Textfeld');assert.equal(parent.inserted,made[0]);assert.equal(made[0].attrs['data-gw-input-box'],'');assert.equal(label.textContent,'Markieren');
  mark.handlers.click();assert.equal(sent.length,0,'ohne Grund wird nichts gesendet');
  made[0].value='  Zeitzeugin widerspricht  ';mark.handlers.click();
  assert.equal(sent.length,1);{const m=P(sent[0]);assert.equal(m.action,'section.mark_stale');assert.equal(m.section_id,'sec-01-01');assert.equal(m.reason,'Zeitzeugin widerspricht');assert(!sent[0].includes('```'));}
  assert.equal(mark.disabled,true);
  // Vorlagen
  const ov=GW.renderHtml('projektuebersicht',{TODO:[{TODO_TEXT:'Kapitel 2: Sprache nicht bestanden',TODO_ACTION:'view.chapter',TODO_ARGS:'{"chapter_id":"ch-02"}',TODO_ACTION2:'view.notes_review',TODO_ARGS2:'{}'},{TODO_TEXT:'Buch neu prüfen (Sprache)',TODO_ACTION:'',TODO_ARGS:'{}',TODO_ACTION2:'',TODO_ARGS2:'{}'}],
    STALE_TEXT:'3 veraltet',CHECKOUTS:[{CO_ID:'GW-7F3A',CO_TEXT:'Kapitel 3–5 ausgecheckt an Anna seit 24.11. (GW-7F3A)',CO_ARGS:'{"checkout":"GW-7F3A"}'}],
    CHAPTERS:[{CHAPTER_ID:'ch-01',CHAPTER_NUMBER:1,CHAPTER_TITLE:'Eins',CHAPTER_STALE_TEXT:'1 veraltet',CHAPTER_STALE_HINT:'seit 25.11.: Grund',CHAPTER_CHECKOUT_TEXT:'ausgecheckt (GW-7F3A)'}],MATTER_FRONT:[{MATTER_ID:'mat-vorwort',MATTER_TITLE:'Vorwort',MATTER_STALE_TEXT:'veraltet',MATTER_STALE_HINT:'seit 25.11.: Grund'}]},'de');
  assert.match(ov,/Handlungsbedarf/);assert.match(ov,/data-gw-send="view.chapter"/);assert.match(ov,/Kapitel 2: Sprache nicht bestanden/);
  assert.match(ov,/data-gw-send="checkout.end" data-gw-args="\{&quot;checkout&quot;:&quot;GW-7F3A&quot;\}"/);assert.match(ov,/data-gw-confirm="Checkout beenden\?/);
  assert.match(ov,/data-gw-send="stale.list"/);assert.match(ov,/3 veraltet/);
  assert.match(ov,/title="seit 25.11.: Grund">1 veraltet<\/span><span class="gw-flag co">ausgecheckt \(GW-7F3A\)/);
  assert.match(ov,/>veraltet<\/span>/);
  const q=GW.renderHtml('warteschlange',{FAILED:[{J_TITLE:'Recherche',J_DETAIL:'Modell nicht mehr verfügbar',J_WHEN_TEXT:'fehlgeschlagen 24.11.',J_ARGS:'{"request":"chapters/c/research/s/request-001.yml"}'}]},'de');
  assert.match(q,/data-gw-send="queue.retry"/);assert.match(q,/Erneut versuchen/);
  assert.match(GW.renderHtml('warteschlange',{FAILED:[{J_TITLE:'x',J_DETAIL:'y',J_WHEN_TEXT:'z',J_ARGS:'{}'}]},'en'),/Retry/);
  const sec=GW.renderHtml('abschnitt-bearbeiten',{SECTION_ID:'sec-01-01',STALE_TEXT:'Veraltet seit 25.11.2026: Grund',STALE_ARGS:'{"section_id":"sec-01-01"}'},'de');
  assert.match(sec,/data-gw-send="section.clear_stale"/);
  const kap=GW.renderHtml('kapitelansicht',{SECTIONS:[{SECTION_ID:'s',SECTION_NUMBER:'1.1',SECTION_TITLE:'T',SECTION_STALE_TEXT:'veraltet',SECTION_STALE_HINT:'seit 25.11.: Grund',SECTION_CHECKOUT_TEXT:'ausgecheckt'}],CHECKOUTS:[{CO_ID:'GW-1',CO_TEXT:'Kapitel 1 ausgecheckt',CO_ARGS:'{"checkout":"GW-1"}'}]},'de');
  assert.match(kap,/>veraltet<\/span><span class="gw-tag recht">ausgecheckt<\/span>/);assert.match(kap,/data-gw-send="checkout.end"/);
  console.log('v0.69.0: mark with reason, empty actions, needs-attention card, stale and checkout marks, retry button passed');
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
    GW:{withHead:(x,d)=>d,message:(t,a,d)=>require('./helpers.cjs').loadGW().message(t,a,d)},tr:(k,a)=>k+(a?JSON.stringify(a):''),sendPrompt:s=>sent.push(s)});
  a.btn('ja').click();
  assert.match(sent[0],/`gw:notes_review.decide file=editorial\/durchsicht-2026-11-20.yml entry=e-001 decision=ja`/);
  b.btn('nein').click();assert.equal(sent.length,1);   // schon entschieden: keine Bindung
  c.btn('geändert').click();assert.equal(sent.length,1);   // erst Textfeld
  c.kids['textarea:not([data-q])'].value='Eigene Fassung';c.btn('geändert').click();
  {const m=P(sent[1]);assert.equal(m.action,'notes_review.decide');assert.equal(m.decision,'geändert');assert.equal(m.new,'Eigene Fassung');}
  // Frage stellen (#609): erst Textfeld, dann notes_review.ask; nichts wird gesperrt oder entschieden
  const before=sent.length;a.ask.click();assert.equal(sent.length,before);
  a.kids['textarea[data-q]'].value='Wie lange segelt man von Trogir nach Triest?';a.ask.click();
  assert.equal(sent.length,before+1);{const m=P(sent[before]);assert.equal(m.action,'notes_review.ask');assert.equal(m.entry,'e-001');assert.equal(m.question,'Wie lange segelt man von Trogir nach Triest?');}
  plan.click();assert.match(sent[sent.length-1],/notes_review.plan file=/);
  console.log('Notes review: groups, escaping, one decision per click, rephrase needs text, plan button passed');
}
// v0.70.0 (GhostWriter #490, #573, #209, #473, #630): Glossar-Auswahl, Rückgabe, Variantenknöpfe
{
  const sent=[];context.sendPrompt=t=>sent.push(t);
  const made=[];
  context.document.createElement=()=>{const t={style:{},attrs:{},disabled:false,handlers:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(e,fn){this.handlers[e]=fn;}};made.push(t);return t;};
  const attrs={'data-gw-variants':JSON.stringify(['Erste Fassung','Zweite <b>Fassung</b>']),'data-gw-variants-label':'Variante','data-gw-variants-file':'editorial/durchsicht-x.yml','data-gw-variants-entry':'e-007'};
  const holder={children:[],getAttribute:k=>attrs[k]||null,appendChild(x){this.children.push(x);},remove(){this.removed=true;}};
  const empty={getAttribute:()=>null,remove(){this.removed=true;},appendChild(){}};
  const host={innerHTML:'',querySelectorAll:sel=>sel==='[data-gw-variants]'?[holder,empty]:[]};
  const getById=context.document.getElementById;
  context.document.getElementById=()=>({textContent:'',dataset:{},addEventListener(){},remove(){},querySelectorAll:()=>[]});
  GW.render('hinweisdurchsicht',{REVIEW_FILE:'editorial/durchsicht-x.yml',AUTHOR:[{E_ID:'e-007',E_VARIANTS_JSON:JSON.stringify(['Erste Fassung','Zweite <b>Fassung</b>'])}]},host,'de');
  context.document.getElementById=getById;
  assert.equal(empty.removed,true,'ohne Varianten entfällt das Element');
  assert.equal(holder.children.length,2);assert.equal(holder.children[0].textContent,'Variante 1: Erste Fassung');
  holder.children[1].handlers.click();
  assert.equal(sent.length,1);{const m=P(sent[0]);assert.equal(m.action,'notes_review.decide');assert.equal(m.entry,'e-007');assert.equal(m.decision,'geändert');}
  {const m=P(sent[0]);assert.equal(String(m.variant),'2');assert.equal(m.new,'Zweite <b>Fassung</b>');}
  assert.equal(holder.children.every(b=>b.disabled),true,'nach dem Senden sind alle Varianten gesperrt');
  const html=GW.renderHtml('hinweisdurchsicht',{REVIEW_FILE:'editorial/durchsicht-x.yml',AUTHOR:[{E_ID:'e-007',E_VARIANTS_JSON:'["a \\"b\\" <x>"]'}]},'de');
  assert.match(html,/data-gw-variants="\[&quot;a \\&quot;b\\&quot; &lt;x&gt;&quot;\]"/);assert.doesNotMatch(html,/<x>/);
  // Glossar-Begriffe: nichts vorangehakt, Erklärung Pflicht (Skript), Texte de/en
  const gl=GW.renderHtml('glossar-vorschlag',{KIND:'glossary',RUN_ID:'run-001',SCOPE_TEXT:'ganzes Buch',SUGGEST_COUNT_TEXT:'2 Begriffe',SUGGESTIONS:[{S_IDX:0,S_TERM:'Etikett <b>',S_EXPL:'Ein Wort',S_SECTIONS:'1.1',S_EVIDENCE:'1.1: „Etikett“',S_STATE:'new',S_STATE_TEXT:'neu'}]},'de');
  assert.match(gl,/Glossar-Begriffe aus dem Text/);assert.match(gl,/<input type="checkbox" class="on"/);assert.doesNotMatch(gl,/class="on" checked/);assert.doesNotMatch(gl,/Etikett <b>/);
  assert.match(GW.renderHtml('glossar-vorschlag',{KIND:'glossary',SUGGESTIONS:[]},'en'),/Glossary terms from the text/);
  // Rückgabe: Aufbau-Änderungen mit Auswahl, Befundknopf, Checkout beenden
  const rt=GW.renderHtml('rueckgabe',{RET_ID:'GW-7F3A',RET_KIND_TEXT:'Word-Datei (DOCX)',RET_DATE_TEXT:'25.11.2026',RET_STATS_TEXT:'3 Befunde · 1 Kommentar',RET_FOLDER:'checkouts/GW-7F3A/rueckgabe-2026-11-25',
    RET_FINDINGS_FILE:'editorial/rueckgabe-GW-7F3A-2026-11-25.yml',RET_END_ARGS:'{"id":"GW-7F3A"}',RET_APPLY_HINT:'Checkout erst beenden',NOTES:[{N_TEXT:'Vergleich über den Text'}],
    AUFBAU:[{A_ID:'a-001',A_TEXT:'neuer Abschnitt „X“',A_STATE:'offen'}]},'de');
  assert.match(rt,/Rückgabe eingecheckt/);assert.match(rt,/data-id="a-001"/);assert.match(rt,/data-gw-send="checkout.end"/);assert.match(rt,/Checkout erst beenden/);assert.doesNotMatch(rt,/class="on" checked/);
  assert.match(GW.renderHtml('rueckgabe',{RET_ID:'GW-1'},'en'),/Return checked in/);
  assert.ok(GW.writes.includes('checkout.aufbau'));
  console.log('v0.70.0: variant buttons, glossary selection, checked-in return passed');
}
