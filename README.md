# GhostWriter UI

Darstellungscode für die Chat-Ansichten von [GhostWriter](https://github.com/ploeffler/GhostWriter): Projektübersicht, Kapitelansicht, Abschnittsformular, Abschnittssteuerung und die Formulare. Dieses Repository enthält **keine Buchinhalte**; die Daten kommen zur Laufzeit aus dem Chat.

## Verwendung im Chat

Der Assistent gibt statt der fertigen Ansicht nur eine Ladezeile und die Daten aus:

```html
<div id="gw"></div>
<script src="https://cdn.jsdelivr.net/gh/ploeffler/ghostwriter-ui@<commit>/dist/gw.js"></script>
<script>GW.render("kapitelansicht", { "CHAPTER_TITLE": "…", "SECTIONS": [ … ] })</script>
```

- `GW.render(name, data, element?)` befüllt die Vorlage `templates/<name>.html` mit `data` und startet ihr Skript. Ohne `element` wird `#gw` verwendet.
- Die Datenfelder sind die Platzhalter der Vorlage; Wiederholblöcke (`{{#SECTIONS}}`) sind Arrays. Welche Felder woher kommen, steht in GhostWriter unter `templates/ui/BEFUELLUNG.md`.
- Statuswerte in Feldern auf `_STATUS` (z. B. `writing`) zeigt `gw.js` deutsch an (`Schreiben`); unbekannte Werte bleiben, wie sie sind.
- Bereiche mit `data-gw-if="NAME"` entfallen, wenn `NAME` fehlt oder leer ist.
- Klicks senden über `sendPrompt` eine Textzeile plus einen Block `gw` mit JSON in den Chat.

`<commit>` ist ein fester Commit dieses Repos. So ändert sich eine Ansicht nicht unbemerkt, und jsDelivr kann die Datei dauerhaft zwischenspeichern. `@main` funktioniert auch, wird von jsDelivr aber bis zu zwölf Stunden zwischengespeichert.

## Entwickeln

Die Vorlagen in `templates/` sind die Quelle; `dist/gw.js` wird daraus gebaut und nicht von Hand geändert:

```sh
python3 build.py
```

Die Version steht in `VERSION`.
