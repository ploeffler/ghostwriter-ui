// Nachrichtenformat der Widgets (GhostWriter #642): kein Codeblock, Rundlauf für schwierige Texte.
const assert=require('node:assert/strict');
const {loadGW,parseMessage}=require('./helpers.cjs');
const GW=loadGW();
const cases=[
  {action:'notes_review.decide',data:{file:'editorial/durchsicht.yml',entry:'e-033',decision:'geändert',new:'Neue Fassung mit Leerzeichen'}},
  {action:'notes_review.ask',data:{entry:'e-001',question:'Wie lange segelt man\nvon Trogir nach Triest?'}},
  {action:'section.update',data:{section_id:'sec-01',text:'Zeile 1\n\nZeile 3 mit "Anführungszeichen" und \'Apostroph\''}},
  {action:'section.update',data:{section_id:'sec-01',text:'Backtick ` und ```gw\n{"x":1}\n``` und Backslash \\ am Ende\\'}},
  {action:'chapter.update',data:{chapter_id:'ch-1',title:'',order:[1,2,3],flag:true,n:4,meta:{a:'b c'}}},
  {action:'view.section',data:{section_id:'sec-02-04-die-scham'}},
  {action:'x.save',data:{text:'  führende Leerzeichen\n  zweite Zeile\nfeld: kein Feld'}},
];
for(const c of cases){
  const msg=GW.message('Klartext der Zeile',c.action,c.data);
  assert(!msg.includes('```'),'Kein Codeblock in: '+JSON.stringify(msg));
  assert(msg.startsWith('Klartext der Zeile\n\n`gw:'+c.action),'Kennzeile folgt auf die Klartextzeile');
  const back=parseMessage(msg);
  const want=Object.assign({action:c.action},c.data);
  for(const k of Object.keys(want)){
    const v=want[k];
    if(typeof v==='number'||typeof v==='boolean')assert.equal(String(back[k]),String(v),k);   // Kurzform: Zahlen/Booleans als Text, wie bisher gelesen
    else assert.deepEqual(back[k],v,k);
  }
}
// expected_head_sha wird gekürzt; kurze Werte stehen in der Kennzeile.
const m=GW.message('t','a.b',{expected_head_sha:'0123456789abcdef0123456789abcdef01234567',x:'y'});
assert.match(m,/^t\n\n`gw:a\.b expected_head_sha=0123456789ab x=y`$/);
// Das alte JSON-Format wird weiter gelesen (Übergang).
assert.deepEqual(parseMessage('Text\n\n```gw\n{"action":"a.b","k":"v w"}\n```'),{action:'a.b',k:'v w'});
console.log('message ok');
