const {loadGW}=require('./helpers.cjs');
const realGW=loadGW();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..');
const de=JSON.parse(fs.readFileSync(path.join(root,'i18n/de.json'),'utf8'));
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'dist/gw.js'),'utf8'),context);
const GW=context.window.GW;
assert.equal(GW.templates.length,48);
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
  vm.runInNewContext('(function(tr){'+script+'})(tr)',{document:{getElementById:id=>elements[id]},GW:{withHead:(action,data)=>Object.assign({},data,{expected_head_sha:'abc123'}),message:(t,a,d)=>realGW.message(t,a,Object.assign({},d,{expected_head_sha:'abc123'}))},tr:key=>JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json'),'utf8'))[key],sendPrompt:s=>sent.push(s)});
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
console.log('All 48 bilingual templates: compilation, fallback, immutable data and approval gates passed');
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
// Figurengespräch-Steuerkarte (GhostWriter #431): drei Stufen, Daten maskiert, Texte in beiden Sprachen
{
  for(const lang of ['de','en']){
    const html=GW.renderHtml('figurengespraech',{LANGUAGE:lang,TALK_PHASE:'insights',TALK_FIGURE_ID:'char-opi',TALK_FIGURE_NAME:'Opi <b>',TALK_UNTIL_TEXT:'Kapitel 2',
      FIGURES:[{F_ID:'char-opi',F_NAME:'Opi',F_PORTRAIT:''}],PLACES:[{P_VALUE:'2',P_LABEL:'bis Kapitel 2'}],
      INSIGHTS:[{I_IDX:0,I_FIELD:'traits',I_FIELD_TEXT:'Eigenschaften',I_TEXT:'<i>geduldig</i> {{PROJECT_TITLE}}',I_CURRENT:'brummig'}]},lang);
    assert(!html.includes('<i>geduldig</i>') && !html.includes('Opi <b>'));
    assert(html.includes('data-phase="insights"') && html.includes('class="ins"') && !/\{\{t:/.test(html));
    assert(!/class="on"[^>]*\schecked/.test(html),'Erkenntnisse sind nie vorangehakt');
    assert(lang==='de'?html.includes('Erkenntnisse aus dem Gespräch'):html.includes('Insights from the conversation'));
  }
  const tmpl=fs.readFileSync(path.join(root,'templates','figurengespraech.html'),'utf8');
  for(const action of ['character.talk.start','character.talk.end','character.talk.until','character.talk.switch','character.talk.apply','form.cancel'])assert(tmpl.includes("'"+action+"'"),action);
  // Übernehmen nur nach eigener Bestätigung (zweiter Klick), nie vorangehakt
  assert(tmpl.includes('armed')&&tmpl.includes('ui.talk_apply_confirm'));
}
// Scheiben der Projektübersicht (GhostWriter #674): Rahmen und Kopf nur in der Kopf-Scheibe
{
  const tmpl=fs.readFileSync(path.join(root,'templates','projektuebersicht.html'),'utf8');
  assert(tmpl.includes('data-slice="{{SLICE}}"')&&tmpl.includes("sl!=='kopf'")&&(tmpl.match(/data-gw-head/g)||[]).length>=3);
  const html=GW.renderHtml('projektuebersicht',{LANGUAGE:'de',SLICE:'kapitel',CHAPTERS:[{CHAPTER_ID:'ch-1',CHAPTER_NUMBER:1,CHAPTER_TITLE:'Eins'}]},'de');
  assert(html.includes('data-slice="kapitel"')&&html.includes('Eins'));
}
// Figurenbild-Assistent (GhostWriter #540, Teil 3): Stilkarten und Variantenvergleich
{
  for(const lang of ['de','en']){
    const html=GW.renderHtml('figurenbild',{LANGUAGE:lang,FB_MODE:'varianten',FB_FIGURE_ID:'char-opi',FB_FIGURE_NAME:'Opi <b>',
      VARIANTS:[{V_ID:'bild-001',V_ART_TEXT:'Erzeugung',V_STATUS:'gewaehlt',V_STATUS_TEXT:'ausgewählt',V_KLEIDUNG:'Strickjacke',V_TOOL:'unbekannt',V_PROMPT:'<i>x</i>'}],
      MEDIA:[{M_VALUE:'foto',M_LABEL:'Foto',M_DESC:'fotorealistisch'}]},lang);
    assert(!html.includes('Opi <b>')&&!html.includes('<i>x</i>')&&!/\{\{t:/.test(html));
    assert(html.includes('data-mode="varianten"')&&html.includes('data-status="gewaehlt"'));
  }
  const tmpl=fs.readFileSync(path.join(root,'templates','figurenbild.html'),'utf8');
  for(const action of ['figurenbild.stil.save','figurenbild.pick','figurenbild.change','form.cancel'])assert(tmpl.includes("'"+action+"'"),action);
  assert(tmpl.includes('armed')&&tmpl.includes('ui.fb_save_confirm'),'Speichern erst nach eigener Bestätigung');
}
