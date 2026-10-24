#!/usr/bin/env python3
"""Regression tests for the approved Warm Minimalist visual identity."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class WarmPaletteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tokens = json.loads((ROOT / 'tokens/tokens.json').read_text())

    def test_identity_and_primitives(self):
        self.assertEqual(self.tokens['name'], 'Linux Island Warm Minimalist')
        self.assertEqual(self.tokens['palette']['graphite']['900'], '#191816')
        self.assertEqual(self.tokens['palette']['graphite']['800'], '#302D28')
        self.assertEqual(self.tokens['palette']['graphite']['500'], '#898278')
        self.assertEqual(self.tokens['palette']['amber']['300'], '#D8B77F')
        self.assertEqual(self.tokens['palette']['cream']['200'], '#EEE9DF')
        self.assertNotIn('mint', self.tokens['palette'])

    def test_semantic_accents(self):
        dark = self.tokens['semantic']['dark']
        light = self.tokens['semantic']['light']
        self.assertEqual(dark['accent.primary'], '#D8B77F')
        self.assertEqual(light['accent.primary'], '#80551F')
        self.assertEqual(dark['surface.island'], '#191816')
        self.assertEqual(light['surface.island'], '#FBF8F1')

    def test_preview_and_guidelines(self):
        preview = (ROOT/'STYLE_GUIDE_PREVIEW.html').read_text()
        guide = (ROOT/'DESIGN_SYSTEM.md').read_text()
        self.assertIn('Warm Minimalist', preview)
        self.assertIn('Warm Minimalist', guide)
        self.assertNotIn('Graphite & Mint', preview)
        self.assertNotIn('Graphite & Mint', guide)
        self.assertIn('--accent-primary: #D8B77F', preview)
        self.assertIn('--accent-primary: #80551F', preview)

if __name__ == '__main__':
    unittest.main()
