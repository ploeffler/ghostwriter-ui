<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-wortmarke-dark.svg">
    <img src="assets/logo-wortmarke.svg" alt="GhostWriter" height="72">
  </picture>
</p>

# GhostWriter UI

Darstellungscode für die Chat-Ansichten von [GhostWriter](https://github.com/ploeffler/GhostWriter): Projektübersicht, Kapitelansicht, Abschnittsformular, Abschnittssteuerung und die Formulare. Dieses Repository enthält **keine Buchinhalte**; die Daten kommen zur Laufzeit aus dem Chat.

## Verwendung im Chat

Der Assistent gibt statt der fertigen Ansicht nur eine Ladezeile und die Daten aus:

```html
<div id="gw"></div>
<script src="https://cdn.jsdelivr.net/gh/ploeffler/ghostwriter-ui@<commit>/dist/gw.min.js"></script>
<script>GW.render("kapitelansicht", { "CHAPTER_TITLE": "…", "SECTIONS": [ … ] })</script>
```

- `GW.render(name, data, element?, language?)` befüllt die Vorlage `templates/<name>.html` mit `data` und startet ihr Skript. Ohne `element` wird `#gw` verwendet.
- Die Datenfelder sind die Platzhalter der Vorlage; Wiederholblöcke (`{{#SECTIONS}}`) sind Arrays. Welche Felder woher kommen, steht in GhostWriter unter `templates/ui/BEFUELLUNG.md`.
- `HEAD_SHA` in den Daten ist der Commit, aus dem gelesen wurde. `gw.js` hängt ihn an jede schreibende Aktion (`….update`, `….create` außer `edition.create`, `….reorder`, `changes.merge`, `approval.confirm`) als `expected_head_sha` an, damit der Assistent vor dem Schreiben prüfen kann, ob sich die Dateien inzwischen geändert haben.
- Statuswerte in Feldern auf `_STATUS` (z. B. `writing`) zeigt `gw.js` in der gewählten Sprache an. Die übergebenen Daten und internen Statuscodes werden nicht verändert; unbekannte Werte bleiben erhalten.
- Bereiche mit `data-gw-if="NAME"` entfallen, wenn `NAME` fehlt oder leer ist.
- Klicks senden über `sendPrompt` eine Textzeile plus einen Block `gw` mit JSON in den Chat.

`<commit>` ist ein fester Commit dieses Repos. So ändert sich eine Ansicht nicht unbemerkt, und jsDelivr kann die Datei dauerhaft zwischenspeichern. `@main` funktioniert auch, wird von jsDelivr aber bis zu zwölf Stunden zwischengespeichert.

## Deutsch und Englisch

Deutsch bleibt rückwärtskompatibel die Vorgabe. Die explizite vierte Angabe von `GW.render` hat Vorrang vor `data.LANGUAGE`; unbekannte Sprachen fallen auf Deutsch zurück, Varianten wie `en-GB` auf `en`.

Alle 39 Vorlagen bieten deutsche und englische feste Texte einschließlich Tooltips, barrierefreier Attribute, Formularkontrollen und Skriptmeldungen. Pflichtfeld-, Kollisions- und Freigabeprüfungen bleiben erhalten; Aktionsnamen, branchbezogene Namen, IDs, Faktencheck-Werte und numerische Positionen werden nicht übersetzt. `GW.supports(name, language)` prüft die Verfügbarkeit. Die reinen Textansichten und erzeugte Beschriftungen aus `render_view.py` werden im Programm-Repository separat migriert.

```js
GW.render('projektuebersicht', { LANGUAGE: 'en', PROJECT_TITLE: 'Mein deutsches Buch', CHAPTERS: [] });
```

Dynamische Titel, Beschreibungen und Benutzereingaben werden nicht übersetzt. Erzeugte Texte wie Auflagen- und Fortschrittsangaben müssen vom aufrufenden Programm sprachgerecht geliefert werden. `GW.renderHtml(name, data, language?)` liefert dieselbe befüllte HTML-Fassung ohne DOM-Zugriff; `GW.render` ergänzt Sichtbarkeitsregeln und Ereignisse. Sprachtexte werden vor dem Einsetzen maskierter Nutzdaten aufgelöst. Nutzdaten mit Zeichenfolgen wie `{{PROJECT_TITLE}}` oder `{{t:ui.description}}` bleiben wörtliche Daten und werden auch in Wiederholblöcken nicht erneut ausgewertet.

Sprachdateien liegen in `i18n/de.json` und `i18n/en.json`. `{{t:schluessel}}` übersetzt Markup-Beschriftungen; jedes Vorlagenskript erhält eine lokale Funktion `tr(key, values?)` für seine Meldungen. Strukturierte Aktionen, IDs und `expected_head_sha` bleiben unverändert. Der Namensraum `native.*` wird von den nativen Chat-Ansichten im Programm-Repository verwendet; `native-keys.json` beschreibt diesen geteilten Vertrag, `template-keys.json` wird aus den UI-Vorlagen erzeugt. Das Programm hält eine geprüfte Kopie desselben Katalogs.

Der Build prüft gleiche Schlüssel, nichtleere Texte, identische Platzhalter und die verbrauchten Schlüssel. Die CI baut die Datei neu, prüft, dass sie eingecheckt ist, und führt die drei JavaScript-Tests unter `tests/` sowie die Python-Buildtests aus. Die Sprachdateien und `dist/gw.js` gehören gemeinsam in einen Commit.

## Entwickeln

Die Vorlagen in `templates/` sind die Quelle; `dist/gw.js` wird daraus gebaut und nicht von Hand geändert:

```sh
python3 build.py
```

Die Version steht in `VERSION`.

---

<p align="right"><sub>Entwickelt mit Unterstützung von Claude (Anthropic) · <a href="https://claude.ai">claude.ai</a></sub>&nbsp;&nbsp;<picture><source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg"><img src="assets/logo.svg" alt="GhostWriter" height="22" align="absmiddle"></picture></p>
