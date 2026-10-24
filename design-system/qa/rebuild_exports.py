#!/usr/bin/env python3
"""Rebuild flat theme snapshots and deterministic contrast report from tokens.json."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
TOKENS = ROOT / 'tokens' / 'tokens.json'

PAIRS = [
    ('text.primary', 'surface.island', 4.5, 'normal text'),
    ('text.secondary', 'surface.island', 4.5, 'normal text'),
    ('text.tertiary', 'surface.island', 4.5, 'normal text'),
    ('text.primary', 'surface.raised', 4.5, 'normal text'),
    ('text.secondary', 'surface.raised', 4.5, 'normal text'),
    ('text.tertiary', 'surface.raised', 4.5, 'normal text'),
    ('text.onAccent', 'control.primary', 4.5, 'button text'),
    ('icon.primary', 'surface.island', 3.0, 'active icon'),
    ('border.focus', 'surface.island', 3.0, 'focus ring'),
    ('border.strong', 'surface.island', 3.0, 'required control outline'),
    ('status.danger', 'surface.island', 3.0, 'status icon'),
    ('status.warning', 'surface.island', 3.0, 'status icon'),
    ('progress.fill', 'surface.island', 3.0, 'progress fill'),
]


def luminance(hex_color):
    vals = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in vals]
    return sum(w * x for w, x in zip((.2126, .7152, .0722), linear))


def contrast(a, b):
    lighter, darker = sorted((luminance(a), luminance(b)), reverse=True)
    return (lighter + .05) / (darker + .05)


def main():
    tokens = json.loads(TOKENS.read_text())
    checks = []
    for theme in ('dark', 'light'):
        colors = tokens['semantic'][theme]
        flat = {
            'designSystemVersion': tokens['designSystemVersion'],
            'theme': theme,
            'colors': colors,
            **tokens['metrics'],
        }
        (ROOT / 'tokens' / (theme + '.flat.json')).write_text(
            json.dumps(flat, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        for foreground, background, minimum, role in PAIRS:
            ratio = round(contrast(colors[foreground], colors[background]), 2)
            checks.append({
                'theme': theme,
                'foreground': foreground,
                'background': background,
                'contrastRatio': ratio,
                'minimum': minimum,
                'pass': ratio >= minimum,
                'role': role,
            })
    report = {
        'standard': 'WCAG 2.2-inspired AA targets (not a conformance audit)',
        'algorithm': 'WCAG sRGB relative luminance; opaque color pairs',
        'checks': checks,
        'allPass': all(check['pass'] for check in checks),
    }
    (ROOT / 'qa' / 'contrast-report.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print(f"Updated flat themes and {len(checks)} checks: allPass={report['allPass']}")
    for check in checks:
        if not check['pass']:
            print('FAIL:', check)
    return 0 if report['allPass'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
