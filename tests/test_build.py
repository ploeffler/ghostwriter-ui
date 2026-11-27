"""Fehlende, verwaiste und strukturell falsche Übersetzungen verhindern den Build."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ui_build', ROOT / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildTranslationsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(ROOT / 'i18n', self.root / 'i18n')
        shutil.copytree(ROOT / 'templates', self.root / 'templates')
        self.patch = patch.object(build, 'ROOT', self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def modify(self, lang, change):
        path = self.root / 'i18n' / (lang + '.json')
        data = json.loads(path.read_text())
        change(data)
        path.write_text(json.dumps(data))

    def test_valid_resources(self):
        self.assertEqual(set(build.validate_translations()), {'de', 'en'})

    def test_missing_english_key_blocks_build(self):
        self.modify('en', lambda data: data.pop('ui.description'))
        with self.assertRaisesRegex(ValueError, 'Übersetzungsschlüssel'):
            build.validate_translations()

    def test_different_placeholders_block_build(self):
        self.modify('en', lambda data: data.update({'ui.chapter': 'Chapter'}))
        with self.assertRaisesRegex(ValueError, 'Platzhalter'):
            build.validate_translations()

    def test_unused_key_in_both_languages_blocks_build(self):
        for lang in ('de', 'en'):
            self.modify(lang, lambda data: data.update({'ui.unused': 'Unused'}))
        with self.assertRaisesRegex(ValueError, 'unbenutzte'):
            build.validate_translations()

    def test_invalid_resource_type_blocks_build(self):
        (self.root / 'i18n' / 'en.json').write_text('[]')
        with self.assertRaisesRegex(ValueError, 'Objekte'):
            build.validate_translations()


if __name__ == '__main__':
    unittest.main()


class OutputOptionsFieldsTest(unittest.TestCase):
    """Ausgabeoptionen: Vorderseite im PDF und eigene Vorderseite (GhostWriter #324)."""
    def test_front_cover_fields(self):
        import re
        html = (ROOT / 'templates/ausgabeoptionen.html').read_text(encoding='utf-8')
        select = re.search(r'<select id="ts-pdf_cover" data-g="typesetting" data-k="pdf_cover">(.*?)</select>', html, re.S)
        self.assertIsNotNone(select)
        # Werte wie typesetting.pdf_cover im Schema des Programms; leer = Vorgabe proof
        self.assertEqual(re.findall(r'value="([^"]*)"', select.group(1)), ['', 'proof', 'always', 'never'])
        self.assertIn('id="cv-front" data-g="cover" data-k="front"', html)

    def test_all_typesetting_fields(self):
        """Titelseite und Probedruck-Kennzeichnung (GhostWriter #310), Broschüre als Format."""
        import re
        html = (ROOT / 'templates/ausgabeoptionen.html').read_text(encoding='utf-8')
        for key, values in (('title_style', ['classic', 'rules', 'modern', 'spaced', 'band']),
                            ('proof_mark', ['line', 'box', 'watermark', 'watermark_all'])):
            select = re.search(rf'<select id="ts-{key}" data-g="typesetting" data-k="{key}">(.*?)</select>', html, re.S)
            self.assertIsNotNone(select, key)
            self.assertEqual(re.findall(r'value="([^"]*)"', select.group(1)), values)
        formats = re.search(r'id="gw-formats">(.*?)</div>', html, re.S).group(1)
        self.assertEqual(re.findall(r'value="(\w+)"', formats), ['pdf', 'pdf_print', 'booklet', 'cover', 'epub', 'docx'])


class UebersichtSymbole(unittest.TestCase):
    """GhostWriter #760: „eine Ebene höher“ (Abschnitt → Kapitel → Buch → Bücherregal) hat überall das Symbol ti-arrow-up.
    „Zurück“ ohne Ebene (Einstellungen, Dialoge) bleibt ti-arrow-left."""

    def test_ebene_hoeher_arrow_up(self):
        import re
        from pathlib import Path
        for path in sorted((Path(__file__).resolve().parent.parent / 'templates').glob('*.html')):
            text = path.read_text(encoding='utf-8')
            for m in re.finditer(r'<button[^>]*class="gw-sq"[^>]*data-a="view\.(?:project|chapter|library)"[^>]*>\s*<i class="ti ([a-z-]+)"', text):
                self.assertEqual(m.group(1), 'ti-arrow-up', f'{path.name}: Knopf „eine Ebene höher“ braucht ti-arrow-up')
        serie = (Path(__file__).resolve().parent.parent / 'templates' / 'serie.html').read_text(encoding='utf-8')
        self.assertRegex(serie, r'id="gw-back"[^>]*><i class="ti ti-arrow-up"')
        daten = (Path(__file__).resolve().parent.parent / 'templates' / 'daten.html').read_text(encoding='utf-8')
        self.assertRegex(daten, r'data-a="view\.library"><i class="ti ti-arrow-up"')

    def test_sofort_sperrbar_und_begriff(self):
        import json
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent
        t = (root / 'templates' / 'abschnitt-bearbeiten.html').read_text(encoding='utf-8')
        self.assertIn('data-mode="sofort" data-available="{{WRITING_NOW_AVAILABLE}}"', t)
        self.assertIn('data-mode="sofort" data-available="{{RESEARCH_NOW_AVAILABLE}}"', t)
        for lang, word in (('de', 'KI-Entwurf'), ('en', 'AI draft')):
            d = json.loads((root / 'i18n' / f'{lang}.json').read_text(encoding='utf-8'))
            self.assertEqual(d['ui.ghostwriting'], word)
            self.assertNotIn('Automated Content Generation', d['ui.automated_content_generation'])
            self.assertNotIn('v0.5', d['ui.unavailable_in_v0_5'] + d['ui.after_v0_5'])
