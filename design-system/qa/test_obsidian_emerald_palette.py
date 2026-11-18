#!/usr/bin/env python3
"""Regression tests for the approved Obsidian Emerald visual identity."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ObsidianEmeraldPaletteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tokens = json.loads((ROOT / 'tokens/tokens.json').read_text())

    def test_identity_and_primitives(self):
        self.assertEqual(self.tokens['name'], 'Linux Island Obsidian Emerald')
        self.assertEqual(self.tokens['designSystemVersion'], '2.0.0')
        self.assertEqual(self.tokens['palette']['obsidian']['900'], '#0B0B0B')
        self.assertEqual(self.tokens['palette']['obsidian']['800'], '#1C1C1C')
        self.assertEqual(self.tokens['palette']['obsidian']['300'], '#999B9D')
        self.assertEqual(self.tokens['palette']['emerald']['400'], '#59D66C')
        self.assertEqual(self.tokens['palette']['mist']['300'], '#DCE0E2')
        self.assertNotIn('amber', self.tokens['palette'])

    def test_semantic_accents(self):
        dark = self.tokens['semantic']['dark']
        light = self.tokens['semantic']['light']
        self.assertEqual(dark['accent.primary'], '#59D66C')
        self.assertEqual(light['accent.primary'], '#147A38')
        self.assertEqual(dark['surface.island'], '#0B0B0B')
        self.assertEqual(light['surface.island'], '#F7F9FA')
        self.assertEqual(dark['text.onAccent'], '#08100A')
        self.assertEqual(light['text.onAccent'], '#F7F9FA')

    def test_preview_and_guidelines(self):
        preview = (ROOT / 'STYLE_GUIDE_PREVIEW.html').read_text()
        guide = (ROOT / 'DESIGN_SYSTEM.md').read_text()
        self.assertIn('Obsidian Emerald', preview)
        self.assertIn('Obsidian Emerald', guide)
        self.assertNotIn('Warm Minimalist', preview)
        self.assertIn('--accent-primary: #59D66C', preview)
        self.assertIn('--accent-primary: #147A38', preview)


if __name__ == '__main__':
    unittest.main()
