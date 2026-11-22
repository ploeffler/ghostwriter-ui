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
  function fillText(t,d,outer){return t.replace(/\{\{([A-Z_]+)\}\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(d,k)?esc(d[k]):outer&&Object.prototype.hasOwnProperty.call(outer,k)?esc(outer[k]):m;});}
  function fill(t,d){
    // Eine Ersetzung pro Vorlagenstelle: eingesetzte Nutzdaten niemals erneut auswerten.
    return t.replace(/\{\{#([A-Z_]+)\}\}\n?([\s\S]*?)[ \t]*\{\{\/\1\}\}\n?|\{\{([A-Z_]+)\}\}/g,function(m,block,body,key){
      if(block){var rows=d[block]||[];return rows.map(function(r){return fillText(body,r,d);}).join('');}
      return Object.prototype.hasOwnProperty.call(d,key)?esc(d[key]):m;
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
  function supports(name,lang){return !!T[name]&&(language(lang)==='de'||LOCALIZED.indexOf(name)!==-1);}
  function renderHtml(name,data,lang){
    data=data||{};lang=language(lang||data.LANGUAGE);var tr=translator(lang);
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
  function parse(n,attr){var l;try{l=JSON.parse(n.getAttribute(attr)||'[]');}catch(e){l=null;}n.removeAttribute(attr);return Array.isArray(l)?l:[];}
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
  function sendAction(text,action,data){
    var d=withHead(action,data||{}),k=Object.keys(d);
    var short=k.every(function(x){var v=d[x];return typeof v==='number'||typeof v==='boolean'||(typeof v==='string'&&/^[^\s`]{1,80}$/.test(v));});
    sendPrompt(short?text+'\n\n`gw:'+action+k.map(function(x){return ' '+x+'='+d[x];}).join('')+'`':text+'\n\n```gw\n'+JSON.stringify(Object.assign({action:action},d))+'\n```');
  }
  function confirmSend(n){
    var a=function(k){return n.getAttribute(k)||'';},action=a('data-gw-send'),hint=a('data-gw-confirm'),box=null,args;
    try{args=JSON.parse(a('data-gw-args')||'{}');}catch(e){args={};}
    if(!args||typeof args!=='object'||Array.isArray(args))args={};
    function label(t){if(!t)return;var l=n.lastChild;if(l&&l.nodeType===3)l.textContent=t;else n.appendChild(document.createTextNode(t));}
    n.addEventListener('click',function(){
      if(n.disabled)return;
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
  var head='';
  // Schreibende Aktionen ohne Endung .update/.create/.reorder (GhostWriter #179): auch sie bekommen den gelesenen
  // Stand, damit ein veraltetes Formular keine zwischenzeitliche Änderung überschreibt. Reine Aufträge, die nur
  // einen Lauf oder eine Action starten (run.start, edition.*), gehören nicht dazu.
  var WRITES=['changes.merge','approval.confirm','chapter.sections.add','chapter.research.start','series.volume.add',
    'series.volume.remove','series.omnibus.approve','series.omnibus.revoke','series.omnibus.publish','import.apply',
    'import.edit','import.outline.apply','analysis.apply','character.suggest.apply','image.place'];
  function withHead(action,d){
    var writes=(/\.(update|create|reorder)$/.test(action)&&action!=='edition.create')||WRITES.indexOf(action)>=0;
    if(!head||!writes||Object.prototype.hasOwnProperty.call(d,'expected_head_sha'))return d;
    var o={};Object.keys(d).forEach(function(k){o[k]=d[k];});o.expected_head_sha=head;return o;
  }
  function render(name,data,el,lang){
    data=data||{};lang=language(lang||data.LANGUAGE);
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
    T[name].run(translator(lang));
  }
  window.GW={version:VERSION,templates:Object.keys(T),render:render,renderHtml:renderHtml,supports:supports,withHead:withHead,writes:WRITES.slice(),escape:esc};

'''


def split(path):
    text = path.read_text(encoding='utf-8')
    text = re.sub(r'\A<!--.*?-->\n', '', text, flags=re.S)
    m = re.search(r'<script>\n?(.*?)</script>\n?', text, re.S)
    script = m.group(1) if m else ''
    html = (text[:m.start()] + text[m.end():]) if m else text
    return html, script


LOCALIZED = ['abschnitt-anlegen', 'analyse-einstellungen', 'abschnitt-bearbeiten', 'abschnittssteuerung', 'aenderungen-uebernehmen', 'auflage-erzeugen', 'ausgabeoptionen', 'auswahl', 'bilder', 'buch-anlegen', 'buecherregal', 'chronologie-vorschlag', 'daten', 'einstellungen', 'figur-bearbeiten', 'figuren', 'figuren-vorschlag', 'freigabe-bestaetigen', 'gliederung-vorschlag', 'hinweisdurchsicht', 'import-vorschau', 'kapitel-anlegen', 'kapitel-bearbeiten', 'kapitelansicht', 'kapitelrecherche', 'ki-angabe', 'ki-dienste', 'kurzbeschreibung-vorschlag', 'orte-vorschlag', 'projektdaten-bearbeiten', 'projekteinstellungen', 'projektuebersicht', 'reihenfolge', 'sammelband', 'serie', 'serie-bearbeiten', 'sprache-vorschlag', 'stilprofil-vorschlag', 'teil-bearbeiten', 'vor-nachspann', 'widerspruch-vorschlag', 'zeitleiste', 'zeitleiste-vorschlag']


def validate_translations():
    resources = {lang: json.loads((ROOT / 'i18n' / (lang + '.json')).read_text(encoding='utf-8')) for lang in ('de', 'en')}
    reference = resources['de']
    if not all(isinstance(value, dict) for value in resources.values()):
        raise ValueError('Sprachdateien müssen Objekte sein')
    used = set(json.loads((ROOT / 'i18n' / 'native-keys.json').read_text(encoding='utf-8')))
    used |= {'status.' + code for code in ('planned', 'in_progress', 'ready_for_assembly', 'assembly', 'review', 'ready_for_approval', 'approved', 'research', 'brainstorming', 'ready_to_write', 'writing', 'revision', 'fact_check')}
    used |= {'runtime.unknown_template', 'runtime.unavailable'}
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
