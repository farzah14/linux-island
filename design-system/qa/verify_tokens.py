#!/usr/bin/env python3
"""Dependency-free Linux Island design-token consistency and contrast checker."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKENS = json.loads((ROOT / 'tokens' / 'tokens.json').read_text())
REPORT = json.loads((ROOT / 'qa' / 'contrast-report.json').read_text())


def luminance(hexcolor):
    if not isinstance(hexcolor, str) or len(hexcolor) != 7 or not hexcolor.startswith('#'):
        raise ValueError(f'Invalid RGB color: {hexcolor!r}')
    channels = [int(hexcolor[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def verify():
    errors = []
    themes = TOKENS['semantic']
    if TOKENS.get('designSystemVersion') != '1.0.0':
        errors.append('Expected designSystemVersion 1.0.0')
    if TOKENS.get('format') != 'linux-island-token-collection/v1':
        errors.append('Unknown token format identifier')
    if set(themes['dark']) != set(themes['light']):
        errors.append('Semantic role keys are different between themes')
    for theme in ('dark', 'light'):
        flat = json.loads((ROOT / 'tokens' / f'{theme}.flat.json').read_text())
        if flat['colors'] != themes[theme]:
            errors.append(f'{theme}.flat colors differ from canonical tokens')
        for role, value in TOKENS['metrics'].items():
            if flat.get(role) != value:
                errors.append(f'{theme}.flat metric mismatch: {role}')
    for check in REPORT['checks']:
        colors = themes[check['theme']]
        actual = round(contrast(colors[check['foreground']], colors[check['background']]), 2)
        if actual != check['contrastRatio']:
            errors.append(f"Stale contrast value: {check['theme']} {check['foreground']}/{check['background']}")
        if actual < check['minimum']:
            errors.append(f"Contrast below target: {check['theme']} {check['foreground']}/{check['background']} {actual}:1")
    if not REPORT['allPass']:
        errors.append('Contrast report allPass must be true after all checks pass')
    if len(REPORT['checks']) != 26:
        errors.append('Expected 26 high-priority contrast checks')
    if errors:
        for error in errors:
            print('FAIL:', error)
        return 1
    print(f"PASS: {len(REPORT['checks'])} contrast checks; both flat themes match canonical JSON; token format and version valid")
    return 0


if __name__ == '__main__':
    sys.exit(verify())
