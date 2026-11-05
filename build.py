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
  function fillText(t,d){return t.replace(/\{\{([A-Z_]+)\}\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(d,k)?esc(d[k]):m;});}
  function fill(t,d){
    t=t.replace(/\{\{#([A-Z_]+)\}\}\n?([\s\S]*?)[ \t]*\{\{\/\1\}\}\n?/g,function(m,k,body){
      var rows=d[k]||[];return rows.map(function(r){return fillText(body,r);}).join('');
    });
    return fillText(t,d);
  }
  var I18N=DICTIONARIES;
  function languageCode(value){return String(value||'de').toLowerCase().split(/[-_]/)[0]==='en'?'en':'de';}
  function translate(key,language){
    var lang=languageCode(language), value=(I18N[lang]&&I18N[lang].keys[key]);
    if(value==null)value=I18N.de.keys[key];
    return value==null?key:value;
  }
  function localizeData(d,lang){
    var o={};
    Object.keys(d||{}).forEach(function(k){
      var v=d[k];
      if(Array.isArray(v))v=v.map(function(r){return r&&typeof r==='object'?localizeData(r,lang):r;});
      else if(/_STATUS$/.test(k)&&I18N[lang].status&&Object.prototype.hasOwnProperty.call(I18N[lang].status,v))v=I18N[lang].status[v];
      o[k]=v;
    });
    return o;
  }
  function translateDOM(el,lang){
    el.querySelectorAll('[data-i18n]').forEach(function(n){n.textContent=translate(n.getAttribute('data-i18n'),lang);});
    [['data-i18n-placeholder','placeholder'],['data-i18n-title','title'],['data-i18n-aria-label','aria-label']].forEach(function(pair){
      el.querySelectorAll('['+pair[0]+']').forEach(function(n){n.setAttribute(pair[1],translate(n.getAttribute(pair[0]),lang));});
    });
  }
  var head='';
  function withHead(action,d){
    var writes=(/\.(update|create|reorder)$/.test(action)&&action!=='edition.create')||action==='changes.merge'||action==='approval.confirm';
    if(!head||!writes||Object.prototype.hasOwnProperty.call(d,'expected_head_sha'))return d;
    var o={};Object.keys(d).forEach(function(k){o[k]=d[k];});o.expected_head_sha=head;return o;
  }
  function render(name,data,el,language){
    var t=T[name];
    if(!t)throw new Error('Unknown GhostWriter template: '+name);
    if(typeof el==='string'&&language==null){language=el;el=null;}
    data=data||{};
    var lang=languageCode(language||data.INTERFACE_LANGUAGE||'de');
    el=el||document.getElementById('gw');
    data=localizeData(data,lang);
    head=String(data.HEAD_SHA||'');
    el.innerHTML=fill(t.html,data);
    el.querySelectorAll('[data-gw-if]').forEach(function(n){
      var v=data[n.getAttribute('data-gw-if')];
      if(!v||(Array.isArray(v)&&!v.length))n.remove();
    });
    translateDOM(el,lang);
    t.run();
    GW.language=lang;
  }
  window.GW={version:VERSION,templates:Object.keys(T),language:'de',render:render,withHead:withHead,t:function(key){return translate(key,GW.language);}};
'''



def split(path):
    text = path.read_text(encoding='utf-8')
    text = re.sub(r'\A<!--.*?-->\n', '', text, flags=re.S)
    m = re.search(r'<script>\n?(.*?)</script>\n?', text, re.S)
    script = m.group(1) if m else ''
    html = (text[:m.start()] + text[m.end():]) if m else text
    return html, script


def main():
    dictionaries = {lang: json.loads((ROOT / 'i18n' / (lang + '.json')).read_text(encoding='utf-8')) for lang in ('de', 'en')}
    if set(dictionaries['de'].get('keys', {})) != set(dictionaries['en'].get('keys', {})):
        raise SystemExit('i18n key mismatch between de.json and en.json')
    if set(dictionaries['de'].get('status', {})) != set(dictionaries['en'].get('status', {})):
        raise SystemExit('i18n status mismatch between de.json and en.json')
    for lang, dictionary in dictionaries.items():
        for group in ('keys', 'status'):
            for key, value in dictionary.get(group, {}).items():
                if not isinstance(value, str) or not value.strip():
                    raise SystemExit(f'Empty or invalid translation: {lang}.{group}.{key}')
    template_paths = sorted((ROOT / 'templates').glob('*.html'))
    used_keys = set()
    for path in template_paths:
        source = path.read_text(encoding='utf-8')
        used_keys.update(re.findall(r'data-i18n(?:-(?:placeholder|title|aria-label))?="([^"]+)"', source))
        used_keys.update(re.findall(r"GW\\.t\\(['\"]([^'\"]+)['\"]\\)", source))
    declared_keys = set(dictionaries['de'].get('keys', {}))
    missing_keys = used_keys - declared_keys
    orphaned_keys = declared_keys - used_keys
    if missing_keys or orphaned_keys:
        raise SystemExit(f'i18n key usage mismatch: missing={sorted(missing_keys)}, orphaned={sorted(orphaned_keys)}')
    runtime = RUNTIME.replace('DICTIONARIES', json.dumps(dictionaries, ensure_ascii=False, separators=(',', ':')))
    parts = ['/* GhostWriter UI ' + VERSION + ' – gebaut aus templates/*.html mit build.py, nicht von Hand ändern */',
             '(function(){', f'  var VERSION={json.dumps(VERSION)};', '  var T={};']
    for path in template_paths:
        html, script = split(path)
        parts.append(f'  T[{json.dumps(path.stem)}]={{html:{json.dumps(html, ensure_ascii=False)},run:function(){{\n{script}\n}}}};')
    parts.append(runtime)
    parts.append('})();')
    out = ROOT / 'dist' / 'gw.js'
    out.write_text('\n'.join(parts) + '\n', encoding='utf-8')
    print(f'{out.relative_to(ROOT)}: {out.stat().st_size} Bytes, {len(list((ROOT / "templates").glob("*.html")))} Vorlagen')


if __name__ == '__main__':
    main()
