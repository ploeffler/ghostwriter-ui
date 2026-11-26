// Fähigkeiten der Umgebung (GhostWriter #662): ausgegraute Knöpfe vor dem Klick.
const assert=require('node:assert/strict');
const {loadGW}=require('./helpers.cjs');
const GW=loadGW();
function btn(attrs){const a=Object.assign({},attrs),cls=new Set();
  return {getAttribute:k=>k in a?a[k]:null,setAttribute:(k,v)=>{a[k]=v;},classList:{add:c=>cls.add(c),has:c=>cls.has(c)},attrs:a};}
const el=bs=>({querySelectorAll:()=>bs});

// Ohne Liste bleibt alles wie bisher.
const x=btn({'data-a':'edition.create'});
GW.applyCapabilities(el([x]));
assert.equal(x.attrs.disabled,undefined);
assert.equal(JSON.stringify(GW.capabilities()),'[]');

// Mit Liste: Knöpfe mit data-a und data-gw-send der Aktionen sind ausgegraut, andere nicht.
GW.capabilities({'edition.create':{state:'spaeter',reason:{de:'Kommt mit v1.6.',en:'Coming with v1.6.'}},
                 'analysis.start':{state:'chat',reason:{de:'Das geht im Chat.',en:'Available in the chat.'}}});
const a=btn({'data-a':'edition.create'}),b=btn({'data-gw-send':'analysis.start'}),c=btn({'data-a':'view.chapter'});
GW.applyCapabilities(el([a,b,c]));
assert.equal(a.attrs.disabled,'');assert.equal(a.attrs['aria-disabled'],'true');
assert.equal(a.attrs.title,'Kommt mit v1.6.');assert.equal(a.attrs['data-gw-na'],'Kommt mit v1.6.');
assert(a.classList.has('gw-na'));
assert.equal(b.attrs.title,'Das geht im Chat.');
assert.equal(c.attrs.disabled,undefined);

// Sprache: Grund englisch, unbekannte Sprache fällt auf Deutsch zurück.
GW.capabilities({'edition.create':{state:'spaeter',reason:{de:'Kommt mit v1.6.',en:'Coming with v1.6.'}}},'en');
assert.equal(GW.capability('edition.create').reason,'Coming with v1.6.');
assert.equal(GW.capability('edition.create').state,'spaeter');
assert.equal(GW.capability('view.chapter'),null);
GW.capabilities({},'de');assert.equal(JSON.stringify(GW.capabilities()),'[]');

// Eine volle Darstellung bleibt ohne Liste unverändert (kein Fehler im echten Render-Pfad).
assert.doesNotThrow(()=>GW.renderHtml('projektuebersicht',{LANGUAGE:'de',PROJECT_TITLE:'T',CHAPTERS:[]}));
console.log('capabilities ok');
