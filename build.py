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
  var STATUS={planned:'geplant',in_progress:'in Arbeit',ready_for_assembly:'bereit zum Zusammenführen',assembly:'wird zusammengeführt',review:'Durchsicht',ready_for_approval:'bereit zur Freigabe',approved:'freigegeben',research:'Recherche',brainstorming:'Ideensammlung',ready_to_write:'bereit zum Schreiben',writing:'Schreiben',revision:'Überarbeitung',fact_check:'Faktencheck'};
  function german(d){
    var o={};
    Object.keys(d).forEach(function(k){
      var v=d[k];
      if(Array.isArray(v))v=v.map(function(r){return r&&typeof r==='object'?german(r):r;});
      else if(/_STATUS$/.test(k)&&Object.prototype.hasOwnProperty.call(STATUS,v))v=STATUS[v];
      o[k]=v;
    });
    return o;
  }
  function render(name,data,el){
    var t=T[name];
    if(!t)throw new Error('GhostWriter-Vorlage unbekannt: '+name);
    el=el||document.getElementById('gw');
    data=german(data||{});
    el.innerHTML=fill(t.html,data);
    el.querySelectorAll('[data-gw-if]').forEach(function(n){
      var v=data[n.getAttribute('data-gw-if')];
      if(!v||(Array.isArray(v)&&!v.length))n.remove();
    });
    t.run();
  }
  window.GW={version:VERSION,templates:Object.keys(T),render:render};
'''


def split(path):
    text = path.read_text(encoding='utf-8')
    text = re.sub(r'\A<!--.*?-->\n', '', text, flags=re.S)
    m = re.search(r'<script>\n?(.*?)</script>\n?', text, re.S)
    script = m.group(1) if m else ''
    html = (text[:m.start()] + text[m.end():]) if m else text
    return html, script


def main():
    parts = ['/* GhostWriter UI ' + VERSION + ' – gebaut aus templates/*.html mit build.py, nicht von Hand ändern */',
             '(function(){', f'  var VERSION={json.dumps(VERSION)};', '  var T={};']
    for path in sorted((ROOT / 'templates').glob('*.html')):
        html, script = split(path)
        parts.append(f'  T[{json.dumps(path.stem)}]={{html:{json.dumps(html, ensure_ascii=False)},run:function(){{\n{script}\n}}}};')
    parts.append(RUNTIME)
    parts.append('})();')
    out = ROOT / 'dist' / 'gw.js'
    out.write_text('\n'.join(parts) + '\n', encoding='utf-8')
    print(f'{out.relative_to(ROOT)}: {out.stat().st_size} Bytes, {len(list((ROOT / "templates").glob("*.html")))} Vorlagen')


if __name__ == '__main__':
    main()
