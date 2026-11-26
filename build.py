#!/usr/bin/env python3
"""Baut dist/gw.js aus templates/*.html.

Jede Vorlage wird zu einem Eintrag { html, run }: das Markup ohne Kommentar und
ohne <script>, und das Skript der Vorlage als echte Funktion (kein eval).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VERSION = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()

RUNTIME = r'''
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  // Arrays und Objekte (GhostWriter #674, ab 0.74.0) werden als JSON-Text eingesetzt: Prüf-Listen kommen als echtes JSON statt als Zeichenkette.
  function sv(v){return v!==null&&typeof v==='object'?JSON.stringify(v):v;}
  function fillText(t,d,outer){return t.replace(/\{\{([A-Z_]+)\}\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(d,k)?esc(sv(d[k])):outer&&Object.prototype.hasOwnProperty.call(outer,k)?esc(sv(outer[k])):m;});}
  function fill(t,d){
    // Eine Ersetzung pro Vorlagenstelle: eingesetzte Nutzdaten niemals erneut auswerten.
    return t.replace(/\{\{#([A-Z_]+)\}\}\n?([\s\S]*?)[ \t]*\{\{\/\1\}\}\n?|\{\{([A-Z_]+)\}\}/g,function(m,block,body,key){
      if(block){var rows=d[block]||[];return rows.map(function(r){return fillText(body,r,d);}).join('');}
      return Object.prototype.hasOwnProperty.call(d,key)?esc(sv(d[key])):m;
    });
  }
  function language(v){var base=String(v||'de').toLowerCase().replace(/_/g,'-').split('-')[0];return Object.prototype.hasOwnProperty.call(I18N,base)?base:'de';}
  function translator(lang){return function(key,args){
    var text=I18N[lang][key];if(text==null)text=I18N.de[key];
    if(text==null)throw new Error('Unknown translation key: '+key);
    return text.replace(/\{([a-z_]+)\}/g,function(m,k){return args&&Object.prototype.hasOwnProperty.call(args,k)?String(args[k]):m;});
  };}
  function localizedData(d,tr){
    var o={};
    Object.keys(d).forEach(function(k){
      var v=d[k];
      if(Array.isArray(v))v=v.map(function(r){return r&&typeof r==='object'?localizedData(r,tr):r;});
      else if(/_STATUS$/.test(k)&&Object.prototype.hasOwnProperty.call(I18N.de,'status.'+v))v=tr('status.'+v);
      o[k]=v;
    });
    return o;
  }
  // Kompakte Daten (GhostWriter #674): Mit "_PACK":1 fehlen leere Felder ("", [], null) der obersten Ebene; jeder Platzhalter
  // der Vorlage gilt dann als leer statt als {{NAME}} stehen zu bleiben. Ein Wiederholblock darf als {"k":[Schlüssel],"r":[[Werte],…]}
  // kommen (Feldnamen einmal statt je Zeile); fehlende Werte am Zeilenende sind "". Ohne _PACK bleibt alles wie bisher.
  function unpack(name,d){
    if(!d||d._PACK!==1)return d;
    var o={},t=T[name],blank=function(s){String(s).replace(/\{\{([A-Z_]+)\}\}/g,function(m,k){o[k]='';return m;});};
    if(t)blank(t.html);
    Object.keys(I18N.de).forEach(function(k){blank(I18N.de[k]);});   // auch Platzhalter in übersetzten Texten, etwa „Bücherregal ({{LIBRARY_COUNT}})“
    Object.keys(d).forEach(function(k){
      if(k==='_PACK')return;
      var v=d[k];
      if(v&&typeof v==='object'&&!Array.isArray(v)&&Array.isArray(v.k)&&Array.isArray(v.r)){
        var cols=v.k;
        v=v.r.map(function(row){var r={};cols.forEach(function(c,i){r[c]=Array.isArray(row)&&row[i]!==undefined?row[i]:'';});return r;});
      }
      o[k]=v;
    });
    return o;
  }
  function supports(name,lang){return !!T[name]&&(language(lang)==='de'||LOCALIZED.indexOf(name)!==-1);}
  function renderHtml(name,data,lang){
    data=unpack(name,data||{});lang=language(lang||data.LANGUAGE);var tr=translator(lang);
    var t=T[name];if(!t)throw new Error(tr('runtime.unknown_template',{name:name}));
    if(!supports(name,lang))throw new Error(tr('runtime.unavailable',{name:name}));
    // Erst die festen Vorlagentexte übersetzen, dann maskierte Nutzdaten einsetzen.
    var html=t.html.replace(/\{\{t:([a-z0-9_.]+)\}\}/g,function(m,key){return esc(tr(key));});
    return fill(html,localizedData(data,tr));
  }
  // Prüf-Tags (GhostWriter #331, #340): data-gw-checks enthält eine JSON-Liste mit CK_TAG, CK_PILL, CK_TEXT,
  // CK_RESULT, CK_STATE, CK_REPORT. Angezeigt wird ein Tag wie bei den Markern („Qualität ✓·“, sonst CK_TAG),
  // gefärbt nach Ergebnis; gestrichelt, wenn seit der Prüfung geändert oder Stand unbekannt.
  // Fehlt das Feld oder ist die Liste leer, entfällt der Bereich. Ein Tag ist keine Freigabe und sendet nichts.
  var TONE={passed:'success',passed_with_notes:'warning',failed:'danger'};
  function checkTag(c,text){
    var s=document.createElement('span'),tone=TONE[c.CK_RESULT],soft=c.CK_STATE==='changed'||c.CK_STATE==='unknown';
    s.className='gw-check';
    s.setAttribute('data-result',String(c.CK_RESULT||''));s.setAttribute('data-state',String(c.CK_STATE||''));
    s.textContent=String(text);
    s.title=String(c.CK_TEXT||'')+(c.CK_ID?' ('+String(c.CK_ID)+')':'')+(c.CK_NOTE?'\n'+String(c.CK_NOTE):'')+(c.CK_REPORT?'\n'+String(c.CK_REPORT):'');   // Prüf-ID und Notiz (GhostWriter #398)
    s.style.cssText='font-size:11px;padding:1px 7px;border-radius:999px;white-space:nowrap;font-variant-numeric:tabular-nums;'
      +'border:0.5px '+(soft?'dashed':'solid')+' '+(tone?'var(--border-'+tone+',var(--border-strong))':'var(--border)')+';'
      +'background:'+(tone?'var(--bg-'+tone+',var(--surface-1))':'var(--surface-1)')+';'
      +'color:'+(tone?'var(--text-'+tone+',var(--text-secondary))':'var(--text-secondary)');
    return s;
  }
  // Kompakte Prüf-Listen (GhostWriter #674, ab 0.74.0): entweder eine Liste von Objekten oder {"k":[Schlüssel],"r":[[Werte],…],"p":[Berichtspfade]};
  // ist CK_REPORT eine Zahl, ist es der Index in "p" (jeder Pfad steht einmal). Fehlen CK_TEXT, CK_TAG oder CK_MARK, setzt
  // gw.js sie aus CK_LABEL, CK_SHORT, CK_RESULT, CK_STATE, CK_WHEN bzw. CK_DATE und CK_PARTIAL zusammen (Texte aus den Sprachdateien).
  var CK_MARKS={passed:'\u2713',passed_with_notes:'\u2713\u00b7',failed:'\u2717',incomplete:'\u2026',unknown:'?'};
  var CK_TR=function(k){return k;};
  function ckCompose(c){
    if(!c.CK_RESULT)return c;
    var res=String(c.CK_RESULT||''),st=String(c.CK_STATE||''),mark=c.CK_MARK!==undefined?String(c.CK_MARK):(CK_MARKS[res]||'');
    var suf=st==='changed'?'*':(st==='unknown'?'?':'');if(mark==='?'&&suf==='?')suf='';
    if(c.CK_MARK===undefined)c.CK_MARK=mark;
    if(c.CK_TAG===undefined&&c.CK_SHORT!==undefined)c.CK_TAG=String(c.CK_SHORT||'')+mark+suf;
    if(c.CK_TEXT===undefined&&c.CK_LABEL!==undefined)c.CK_TEXT=String(c.CK_LABEL||'')+': '+CK_TR('runtime.check_result_'+res)+', '+String(c.CK_WHEN||c.CK_DATE||'')+' \u00b7 '+CK_TR('runtime.check_state_'+st)+(c.CK_PARTIAL?' \u00b7 '+CK_TR('runtime.check_partial'):'');
    return c;
  }
  function parse(n,attr){
    var l;try{l=JSON.parse(n.getAttribute(attr)||'[]');}catch(e){l=null;}n.removeAttribute(attr);
    if(l&&!Array.isArray(l)&&Array.isArray(l.k)&&Array.isArray(l.r)){
      var cols=l.k,paths=Array.isArray(l.p)?l.p:[];
      l=l.r.map(function(row){var o={};cols.forEach(function(c,i){o[c]=Array.isArray(row)&&row[i]!==undefined?row[i]:'';});
        if(typeof o.CK_REPORT==='number')o.CK_REPORT=paths[o.CK_REPORT]||'';return o;});
    }
    return Array.isArray(l)?l.map(function(c){return c&&typeof c==='object'?ckCompose(c):c;}):[];
  }
  function checks(n){
    var list=parse(n,'data-gw-checks').filter(function(c){return c&&typeof c==='object';});
    if(!list.length){n.remove();return;}
    list.forEach(function(c){n.appendChild(checkTag(c,c.CK_PILL||c.CK_TAG||''));});
  }
  // Frühere Prüfungen (#340): data-gw-checks-history, neueste zuerst; gruppiert nach Prüfart (CK_LABEL),
  // je Eintrag ein kleiner Tag mit Datum und Uhrzeit (CK_WHEN) und Ergebniszeichen; Bericht im Tooltip.
  function checkHistory(n){
    var list=parse(n,'data-gw-checks-history').filter(function(c){return c&&typeof c==='object';});
    if(!list.length){var box=n.closest('[data-gw-checks-box]');(box||n).remove();return;}
    var groups=[],by={};
    list.forEach(function(c){var k=String(c.CK_LABEL||c.CK_KIND||'');if(!by[k]){by[k]=[];groups.push(k);}by[k].push(c);});
    groups.forEach(function(k){
      var row=document.createElement('div'),name=document.createElement('span'),items=document.createElement('span');
      row.className='gw-check-group';
      row.style.cssText='display:flex;gap:8px;align-items:baseline;flex-wrap:wrap';
      name.textContent=k;name.style.cssText='font-size:12px;color:var(--text-secondary);min-width:90px';
      items.style.cssText='display:flex;gap:4px;flex-wrap:wrap';
      by[k].forEach(function(c){
        var mark=String(c.CK_MARK||''),st=c.CK_STATE==='changed'?'*':(c.CK_STATE==='unknown'&&mark!=='?'?'?':'');
        items.appendChild(checkTag(c,(String(c.CK_WHEN||c.CK_DATE||'')+' '+mark+st).trim()));
      });
      row.appendChild(name);row.appendChild(items);n.appendChild(row);
    });
  }
  // Knopf mit Rückfrage (GhostWriter #352): data-gw-send=<Aktion>, data-gw-text=<Klartextzeile>, data-gw-args=<JSON>,
  // data-gw-confirm=<Hinweis vor dem Senden>, data-gw-confirm-label=<Beschriftung zum Bestätigen>,
  // data-gw-done=<Beschriftung nach dem Senden>. Mit data-gw-confirm zeigt der erste Klick den Hinweis über der
  // Knopfzeile (Element mit data-gw-confirm-at, sonst vor dem Elternelement), erst der zweite sendet; ohne sendet schon der erste. Danach ist der Knopf gesperrt.
  // Nachrichtenformat (GhostWriter #642): kein Codeblock, damit die Claude-App die Nachricht nicht als eingeschleusten Code
  // markiert. Erst die Klartextzeile, dann die Kennzeile `gw:<aktion> k=v …` (nur kurze Werte ohne Leerzeichen), danach je
  // Feld mit längerem oder freiem Text eine Zeile `feld: wert`. Mehrzeilige Werte werden mit zwei Leerzeichen eingerückt,
  // `\` und Backtick mit Backslash maskiert, Zahlen/Objekte als `feld (JSON): …`. expected_head_sha wird auf 12 Zeichen gekürzt.
  function maskText(s){return String(s).replace(/\\/g,'\\\\').replace(/`/g,'\\`');}
  // Start der Warteschlange (GhostWriter #65, ab 0.77.0): Ein Element mit data-gw-start (Auswahl: now | later | budget_free | after_approval) und
  // optional data-gw-start-time (Zeitpunkt) ergänzt run.start im Modus scheduled und chapter.research.start um `start`, `not_before` bzw.
  // `after_event` (chapter_approved[:<Kapitel aus data-chapter>]). Ohne Auswahl oder bei „now“ bleibt die Nachricht unverändert.
  var START_ACTIONS={'run.start':1,'chapter.research.start':1};
  function startOptions(action,data){
    data=data||{};
    if(!START_ACTIONS[action]||typeof document==='undefined'||!document.querySelector)return data;
    if(action==='run.start'&&data.mode!=='scheduled')return data;
    var s=document.querySelector('[data-gw-start]');
    if(!s||!s.value||s.value==='now')return data;
    var o={};Object.keys(data).forEach(function(k){o[k]=data[k];});
    o.start=s.value;
    if(s.value==='later'){var t=document.querySelector('[data-gw-start-time]');if(t&&t.value)o.not_before=t.value;}
    if(s.value==='after_approval'){o.after_event='chapter_approved'+(s.getAttribute('data-chapter')?':'+s.getAttribute('data-chapter'):'');}
    return o;
  }
  function startBind(n){
    var t=n.parentNode&&n.parentNode.querySelector?n.parentNode.querySelector('[data-gw-start-time]'):null;
    function sync(){if(t)t.style.display=n.value==='later'?'':'none';}
    n.addEventListener('change',sync);sync();
  }
  function message(text,action,data){
    var d=withHead(action,startOptions(action,data)),inline=[],lines=[];
    Object.keys(d).forEach(function(k){
      var v=d[k];
      if(v===undefined)return;
      if(k==='expected_head_sha'&&typeof v==='string')v=v.slice(0,12);
      if(typeof v==='number'||typeof v==='boolean'||(typeof v==='string'&&/^[^\s`\\]{1,80}$/.test(v))){inline.push(' '+k+'='+v);return;}
      if(typeof v==='string')lines.push(k+':'+(v===''?'':' '+maskText(v).replace(/\r\n?|\n/g,'\n  ')));
      else lines.push(k+' (JSON): '+maskText(JSON.stringify(v)));
    });
    return text+'\n\n`gw:'+action+inline.join('')+'`'+(lines.length?'\n'+lines.join('\n'):'');
  }
  function sendAction(text,action,data){sendPrompt(message(text,action,data));}
  function confirmSend(n){
    var a=function(k){return n.getAttribute(k)||'';},action=a('data-gw-send'),hint=a('data-gw-confirm'),box=null,args;
    try{args=JSON.parse(a('data-gw-args')||'{}');}catch(e){args={};}
    if(!args||typeof args!=='object'||Array.isArray(args))args={};
    function label(t){if(!t)return;var l=n.lastChild;if(l&&l.nodeType===3)l.textContent=t;else n.appendChild(document.createTextNode(t));}
    if(!action){if(n.hasAttribute('data-gw-optional')){n.remove();}else{n.disabled=true;}return;}   // ohne Aktion: nicht klickbar bzw. entfällt
    var input=a('data-gw-input'),ta=null;   // Pflichtfeld vor dem Senden (GhostWriter #592): erster Klick zeigt das Textfeld, der zweite sendet
    n.addEventListener('click',function(){
      if(n.disabled)return;
      if(input){
        if(!ta){
          ta=document.createElement('textarea');ta.rows=2;ta.setAttribute('data-gw-input-box','');ta.placeholder=a('data-gw-input-placeholder');
          ta.style.cssText='width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:6px 8px;border:0.5px solid var(--border-strong);border-radius:8px;background:var(--surface-1);color:var(--text-primary)';
          n.parentNode.insertBefore(ta,n);label(a('data-gw-confirm-label'));ta.focus();return;
        }
        var v=ta.value.trim();if(!v){ta.focus();return;}
        args[input]=v;ta.disabled=true;
      }
      if(hint&&!box){
        box=document.createElement('div');box.setAttribute('role','alert');box.setAttribute('data-gw-confirm-box','');
        box.style.cssText='padding:10px 12px;border:0.5px solid var(--border-warning);border-radius:var(--radius);background:var(--bg-warning);color:var(--text-warning);font-size:13px;line-height:1.5';
        box.textContent=hint;
        var row=(n.closest&&n.closest('[data-gw-confirm-at]'))||n.parentNode;   // vor der Knopfzeile
        if(row&&row.parentNode)row.parentNode.insertBefore(box,row);
        label(a('data-gw-confirm-label'));return;
      }
      n.disabled=true;label(a('data-gw-done'));sendAction(a('data-gw-text')||action,action,args);
    });
  }
  // Varianten (GhostWriter #473, #630): data-gw-variants=<JSON-Liste der Wortlaute>, data-gw-variants-label=<Beschriftung>,
  // data-gw-variants-file=<Durchsichtsdatei>, data-gw-variants-entry=<Eintrags-ID>. Je Variante ein Knopf; ein Klick sendet
  // notes_review.decide mit decision=geändert, variant=<N ab 1> und new=<Wortlaut>. Ohne gültige Liste entfällt das Element.
  function variants(n){
    var list,a=function(k){return n.getAttribute(k)||'';};
    try{list=JSON.parse(a('data-gw-variants')||'[]');}catch(e){list=[];}
    if(!Array.isArray(list)||!list.length||!a('data-gw-variants-entry')){n.remove();return;}
    var label=a('data-gw-variants-label'),buttons=[];
    list.forEach(function(text,i){
      var b=document.createElement('button');b.type='button';b.className='gw-btn';b.setAttribute('data-variant',String(i+1));
      b.style.cssText='text-align:left;white-space:normal;height:auto';
      var shown=String(text);b.textContent=label+' '+(i+1)+': '+(shown.length>160?shown.slice(0,157)+'…':shown);b.title=shown;
      b.addEventListener('click',function(){
        if(b.disabled)return;buttons.forEach(function(x){x.disabled=true;});
        sendAction(label+' '+(i+1),'notes_review.decide',{file:a('data-gw-variants-file'),entry:a('data-gw-variants-entry'),decision:'geändert',variant:i+1,new:String(text)});
      });
      buttons.push(b);n.appendChild(b);
    });
  }
  var head='';
  // Schreibende Aktionen ohne Endung .update/.create/.reorder (GhostWriter #179): auch sie bekommen den gelesenen
  // Stand, damit ein veraltetes Formular keine zwischenzeitliche Änderung überschreibt. Reine Aufträge, die nur
  // einen Lauf oder eine Action starten (run.start, edition.*), gehören nicht dazu.
  var WRITES=['changes.merge','approval.confirm','chapter.sections.add','chapter.research.start','series.volume.add',
    'series.volume.remove','series.omnibus.approve','series.omnibus.revoke','series.omnibus.publish','import.apply',
    'import.edit','import.outline.apply','analysis.apply','character.suggest.apply','image.place','checkout.aufbau','anecdote.plan'];
  function withHead(action,d){
    var writes=(/\.(update|create|reorder)$/.test(action)&&action!=='edition.create')||WRITES.indexOf(action)>=0;
    if(!head||!writes||Object.prototype.hasOwnProperty.call(d,'expected_head_sha'))return d;
    var o={};Object.keys(d).forEach(function(k){o[k]=d[k];});o.expected_head_sha=head;return o;
  }
  // Fähigkeiten der Umgebung (GhostWriter #662, ab 0.80.0): GW.capabilities({aktion:{state:'chat'|'spaeter',reason:{de,en}}}) legt fest, was die Umgebung
  // nicht kann. Danach sind Knöpfe mit data-a bzw. data-gw-send dieser Aktionen schon vor dem Klick ausgegraut (disabled, aria-disabled,
  // title und data-gw-na mit dem Grund, Klasse gw-na). Ohne Aufruf bleibt alles wie bisher. Die Umgebung (Chat, Web-App) liefert die Liste.
  var CAPS={};
  function capability(action){
    var c=Object.prototype.hasOwnProperty.call(CAPS,action)?CAPS[action]:null;
    if(!c)return null;
    var r=c.reason,text=r&&typeof r==='object'?(r[CAPLANG]||r.de||''):String(r||'');
    return {action:action,state:c.state||'spaeter',reason:text};
  }
  var CAPLANG='de';
  function capabilities(map,lang){
    if(map===undefined)return Object.keys(CAPS);
    CAPS={};Object.keys(map||{}).forEach(function(k){if(map[k]&&typeof map[k]==='object')CAPS[k]=map[k];});
    if(lang)CAPLANG=language(lang);
    return Object.keys(CAPS);
  }
  function markNa(n,action){
    var c=capability(action);
    if(!c||n.getAttribute('data-gw-na')!==null&&n.getAttribute('data-gw-na')!==undefined&&n.getAttribute('data-gw-na')!=='')return;
    n.setAttribute('disabled','');n.setAttribute('aria-disabled','true');
    n.setAttribute('data-gw-na',c.reason||c.state);
    if(c.reason)n.setAttribute('title',c.reason);
    if(n.classList)n.classList.add('gw-na');
  }
  function applyCaps(el){
    if(!Object.keys(CAPS).length||!el||!el.querySelectorAll)return;
    el.querySelectorAll('[data-a],[data-gw-send]').forEach(function(n){
      markNa(n,n.getAttribute('data-a')||n.getAttribute('data-gw-send')||'');
    });
  }
  function capsStyle(){
    if(!Object.keys(CAPS).length||typeof document==='undefined'||!document.head||!document.createElement||document.getElementById('gw-na-style'))return;
    var st=document.createElement('style');st.id='gw-na-style';st.textContent='.gw-na{opacity:.5;cursor:not-allowed}';document.head.appendChild(st);
  }
  function render(name,data,el,lang){
    data=unpack(name,data||{});lang=language(lang||data.LANGUAGE);
    var trl=translator(lang);CK_TR=function(k){return trl(k);};
    var html=renderHtml(name,data,lang);
    el=el||document.getElementById('gw');
    head=String(data.HEAD_SHA||'');
    el.innerHTML=html;
    el.querySelectorAll('[data-gw-if]').forEach(function(n){
      var v=data[n.getAttribute('data-gw-if')];
      if(!v||(Array.isArray(v)&&!v.length))n.remove();
    });
    el.querySelectorAll('[data-gw-checks-history]').forEach(checkHistory);
    el.querySelectorAll('[data-gw-checks]').forEach(checks);
    el.querySelectorAll('[data-gw-send]').forEach(confirmSend);
    el.querySelectorAll('[data-gw-variants]').forEach(variants);
    el.querySelectorAll('[data-gw-start]').forEach(startBind);
    T[name].run(translator(lang));
    capsStyle();applyCaps(el);
  }
  window.GW={version:VERSION,templates:Object.keys(T),render:render,renderHtml:renderHtml,unpack:unpack,supports:supports,withHead:withHead,message:message,capabilities:capabilities,capability:capability,applyCapabilities:applyCaps,writes:WRITES.slice(),escape:esc};

'''


def split(path):
    text = path.read_text(encoding='utf-8')
    text = re.sub(r'\A<!--.*?-->\n', '', text, flags=re.S)
    m = re.search(r'<script>\n?(.*?)</script>\n?', text, re.S)
    script = m.group(1) if m else ''
    html = (text[:m.start()] + text[m.end():]) if m else text
    return html, script


LOCALIZED = ['glossar-vorschlag', 'rueckgabe', 'anekdoten', 'abschnitt-anlegen', 'analyse-einstellungen', 'abschnitt-bearbeiten', 'abschnittssteuerung', 'aenderungen-uebernehmen', 'auflage-erzeugen', 'ausgabeoptionen', 'auswahl', 'bilder', 'buch-anlegen', 'buecherregal', 'chronologie-vorschlag', 'daten', 'einstellungen', 'figur-bearbeiten', 'figuren', 'figuren-vorschlag', 'figurengespraech', 'figurenbild', 'freigabe-bestaetigen', 'gliederung-vorschlag', 'hinweisdurchsicht', 'import-vorschau', 'kapitel-anlegen', 'kapitel-bearbeiten', 'kapitelansicht', 'kapitelrecherche', 'ki-angabe', 'ki-dienste', 'kurzbeschreibung-vorschlag', 'orte-vorschlag', 'projektdaten-bearbeiten', 'projekteinstellungen', 'projektuebersicht', 'reihenfolge', 'sammelband', 'serie', 'serie-bearbeiten', 'sprache-vorschlag', 'stilprofil-vorschlag', 'teil-bearbeiten', 'vor-nachspann', 'warteschlange', 'widerspruch-vorschlag', 'zeitleiste', 'zeitleiste-vorschlag']


def validate_translations():
    resources = {lang: json.loads((ROOT / 'i18n' / (lang + '.json')).read_text(encoding='utf-8')) for lang in ('de', 'en')}
    reference = resources['de']
    if not all(isinstance(value, dict) for value in resources.values()):
        raise ValueError('Sprachdateien müssen Objekte sein')
    used = set(json.loads((ROOT / 'i18n' / 'native-keys.json').read_text(encoding='utf-8')))
    used |= {'status.' + code for code in ('planned', 'in_progress', 'ready_for_assembly', 'assembly', 'review', 'ready_for_approval', 'approved', 'research', 'brainstorming', 'ready_to_write', 'writing', 'revision', 'fact_check')}
    used |= {'runtime.unknown_template', 'runtime.unavailable', 'runtime.check_partial'}
    used |= {'runtime.check_result_' + r for r in ('passed', 'passed_with_notes', 'failed', 'incomplete', 'unknown')}
    used |= {'runtime.check_state_' + r for r in ('current', 'changed', 'unknown')}
    for name in LOCALIZED:
        html, script = split(ROOT / 'templates' / (name + '.html'))
        used.update(re.findall(r'\{\{t:([a-z0-9_.]+)\}\}', html))
        used.update(re.findall(r'[\'\"]((?:ui|status)\.[a-z0-9_.]+)[\'\"]', script))
    native_keys = set(json.loads((ROOT / 'i18n' / 'native-keys.json').read_text(encoding='utf-8')))
    (ROOT / 'i18n' / 'template-keys.json').write_text(json.dumps(sorted(used - native_keys), indent=2) + '\n', encoding='utf-8')
    if used != set(reference):
        raise ValueError('Fehlende/unbenutzte Übersetzungsschlüssel: ' + repr(used ^ set(reference)))
    for lang, texts in resources.items():
        if set(texts) != set(reference):
            raise ValueError(lang + ': abweichende Übersetzungsschlüssel')
        for key, value in texts.items():
            if not isinstance(value, str) or not value.strip():
                raise ValueError(lang + ': leere Übersetzung: ' + key)
            markers = lambda text: set(re.findall(r'\{\{[A-Z_]+\}\}|(?<!\{)\{[a-z_]+\}(?!\})', text))
            if markers(value) != markers(reference[key]):
                raise ValueError(lang + ': abweichende Platzhalter: ' + key)
    return resources


def main():
    resources = validate_translations()
    parts = ['/* GhostWriter UI ' + VERSION + ' – gebaut aus templates/*.html mit build.py, nicht von Hand ändern */',
             '(function(){', f'  var VERSION={json.dumps(VERSION)};', '  var T={};', '  var LOCALIZED='+json.dumps(LOCALIZED)+';', '  var I18N='+json.dumps(resources,ensure_ascii=False)+';']
    for path in sorted((ROOT / 'templates').glob('*.html')):
        html, script = split(path)
        parts.append(f'  T[{json.dumps(path.stem)}]={{html:{json.dumps(html, ensure_ascii=False)},run:function(tr){{\n{script}\n}}}};')
    parts.append(RUNTIME)
    parts.append('})();')
    out = ROOT / 'dist' / 'gw.js'
    out.write_text('\n'.join(parts) + '\n', encoding='utf-8')
    print(f'{out.relative_to(ROOT)}: {out.stat().st_size} Bytes, {len(list((ROOT / "templates").glob("*.html")))} Vorlagen')


if __name__ == '__main__':
    main()
