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
