// Kompakte Daten (GhostWriter #674): "_PACK":1 ohne leere Felder und mit kompakten Blöcken ergibt dieselbe Ansicht.
const assert=require('node:assert/strict');
const {loadGW}=require('./helpers.cjs');
const GW=loadGW();

const full={LANGUAGE:'de',PROJECT_TITLE:'Titel',PROJECT_AUTHOR:'',PROJECT_TITLE_SHORT:'T',LIBRARY_COUNT:'',
  CHAPTERS:[{CHAPTER_ID:'ch-1',CHAPTER_TITLE:'Eins',CHAPTER_STATUS:'approved',CHAPTER_NUMBER:1,CHAPTER_NOTE:''},
            {CHAPTER_ID:'ch-2',CHAPTER_TITLE:'Zwei <b>',CHAPTER_STATUS:'writing',CHAPTER_NUMBER:2,CHAPTER_NOTE:'x'}]};
const packed={_PACK:1,LANGUAGE:'de',PROJECT_TITLE:'Titel',PROJECT_TITLE_SHORT:'T',
  CHAPTERS:{k:['CHAPTER_ID','CHAPTER_TITLE','CHAPTER_STATUS','CHAPTER_NUMBER','CHAPTER_NOTE'],
            r:[['ch-1','Eins','approved',1],['ch-2','Zwei <b>','writing',2,'x']]}};

// Gleiche Ausgabe wie mit vollständigen Daten (in denen jedes nicht gelieferte Feld leer wäre), keine stehen gebliebenen Platzhalter.
const blank=html=>html.replace(/\{\{[A-Z_]+\}\}/g,'');
assert.equal(GW.renderHtml('projektuebersicht',packed),blank(GW.renderHtml('projektuebersicht',full)));
assert.doesNotMatch(GW.renderHtml('projektuebersicht',packed),/\{\{[A-Z_]+\}\}/);

// Ausgeklappte Daten: Zeilen als Objekte, fehlende Werte am Zeilenende leer, _PACK entfällt, Eingabe unverändert.
const before=JSON.stringify(packed);
const u=GW.unpack('projektuebersicht',packed),plain=v=>JSON.parse(JSON.stringify(v));   // Objekte aus dem vm-Kontext
assert.equal(u._PACK,undefined);
assert.deepEqual(plain(u.CHAPTERS[0]),{CHAPTER_ID:'ch-1',CHAPTER_TITLE:'Eins',CHAPTER_STATUS:'approved',CHAPTER_NUMBER:1,CHAPTER_NOTE:''});
assert.equal(u.PROJECT_AUTHOR,'');
assert.equal(u.LIBRARY_COUNT,'');   // Platzhalter aus einem Sprachtext
assert.equal(JSON.stringify(packed),before);

// Blöcke dürfen weiter als Liste von Objekten kommen; Werte 0 und false bleiben erhalten.
const mixed=GW.unpack('projektuebersicht',{_PACK:1,CHAPTERS:[{CHAPTER_ID:'a'}],N:0,F:false});
assert.deepEqual(plain(mixed.CHAPTERS),[{CHAPTER_ID:'a'}]);assert.equal(mixed.N,0);assert.equal(mixed.F,false);

// Ohne _PACK bleibt alles wie bisher: Daten unverändert, fehlende Platzhalter bleiben sichtbar.
assert.equal(GW.unpack('projektuebersicht',full),full);
assert.match(GW.renderHtml('projektuebersicht',{PROJECT_TITLE:'x'}),/\{\{[A-Z_]+\}\}/);

// Jede Vorlage: mit _PACK und ganz ohne Daten keine stehen gebliebenen Platzhalter.
for(const name of GW.templates)
  assert.doesNotMatch(GW.renderHtml(name,{_PACK:1}),/\{\{[A-Z_]+\}\}/,name);

console.log('pack: ok');
