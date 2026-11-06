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
  var head='';
  function withHead(action,d){
    var writes=(/\.(update|create|reorder)$/.test(action)&&action!=='edition.create')||action==='changes.merge'||action==='approval.confirm';
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
    T[name].run(translator(lang));
  }
  window.GW={version:VERSION,templates:Object.keys(T),render:render,renderHtml:renderHtml,supports:supports,withHead:withHead,escape:esc};

'''


def split(path):
    text = path.read_text(encoding='utf-8')
    text = re.sub(r'\A<!--.*?-->\n', '', text, flags=re.S)
    m = re.search(r'<script>\n?(.*?)</script>\n?', text, re.S)
    script = m.group(1) if m else ''
    html = (text[:m.start()] + text[m.end():]) if m else text
    return html, script


LOCALIZED = ['abschnitt-anlegen', 'abschnitt-bearbeiten', 'abschnittssteuerung', 'aenderungen-uebernehmen', 'auflage-erzeugen', 'ausgabeoptionen', 'auswahl', 'bilder', 'buch-anlegen', 'buecherregal', 'daten', 'figur-bearbeiten', 'figuren', 'figuren-vorschlag', 'freigabe-bestaetigen', 'gliederung-vorschlag', 'import-vorschau', 'kapitel-anlegen', 'kapitel-bearbeiten', 'kapitelansicht', 'kapitelrecherche', 'ki-angabe', 'ki-dienste', 'kurzbeschreibung-vorschlag', 'orte-vorschlag', 'projektdaten-bearbeiten', 'projekteinstellungen', 'projektuebersicht', 'reihenfolge', 'sammelband', 'serie', 'serie-bearbeiten', 'sprache-vorschlag', 'stilprofil-vorschlag', 'teil-bearbeiten', 'vor-nachspann', 'widerspruch-vorschlag', 'zeitleiste-vorschlag']


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
