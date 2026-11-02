#!/usr/bin/env python3
"""UI parity token validation: checks that ThemeData.qml matches canonical tokens."""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
TOKENS_FILE = ROOT / 'design-system/tokens/tokens.json'
THEME_QML_FILE = ROOT / 'island-ui/qml/ThemeData.qml'

ROLE_MAPPING = {
    'surfaceIsland': 'surface.island',
    'surfaceRaised': 'surface.raised',
    'surfaceHover': 'surface.hover',
    'surfaceScrim': 'surface.scrim',
    'textPrimary': 'text.primary',
    'textSecondary': 'text.secondary',
    'textTertiary': 'text.tertiary',
    'accentPrimary': 'accent.primary',
    'accentHover': 'accent.hover',
    'borderSubtle': 'border.subtle',
    'borderFocus': 'border.focus',
    'statusSuccess': 'status.success',
    'statusWarning': 'status.warning',
    'statusDanger': 'status.danger',
    'progressTrack': 'progress.track',
    'progressFill': 'progress.fill',
}

RADIUS_MAPPING = {
    'radiusXs': 'xs',
    'radiusSm': 'sm',
    'radiusMd': 'md',
    'radiusLg': 'lg',
    'radiusXl': 'xl',
    'radiusPanel': 'panel',
    'radiusPill': 'pill',
}

MOTION_MAPPING = {
    'durationInstant': 'instant',
    'durationFast': 'fast',
    'durationStandard': 'standard',
    'durationEmphasis': 'emphasis',
}


def parse_theme_qml(content: str) -> tuple[dict, dict, dict]:
    """Extract color, radius, and motion values from ThemeData.qml."""
    color_pattern = re.compile(
        r'readonly\s+property\s+color\s+(\w+)\s*:\s*isDark\s*\?\s*"([#0-9a-fA-F]+)"\s*:\s*"([#0-9a-fA-F]+)"'
    )
    int_pattern = re.compile(
        r'readonly\s+property\s+int\s+(\w+)\s*:\s*(\d+)'
    )

    colors = {'dark': {}, 'light': {}}
    for match in color_pattern.finditer(content):
        prop, dark_val, light_val = match.groups()
        colors['dark'][prop] = dark_val.upper()
        colors['light'][prop] = light_val.upper()

    ints = {}
    for match in int_pattern.finditer(content):
        prop, val = match.groups()
        ints[prop] = int(val)

    return colors, ints


def main():
    tokens = json.loads(TOKENS_FILE.read_text())
    semantic = tokens['semantic']
    metrics = tokens['metrics']
    qml_content = THEME_QML_FILE.read_text()
    qml_colors, qml_ints = parse_theme_qml(qml_content)

    errors = []

    # 1. Verify semantic color tokens
    for prop, token_key in ROLE_MAPPING.items():
        for mode in ('dark', 'light'):
            expected = semantic[mode].get(token_key, '').upper()
            actual = qml_colors[mode].get(prop, '')
            if not actual:
                errors.append(f"Missing property {prop} in ThemeData.qml ({mode})")
            elif actual != expected:
                errors.append(
                    f"Token drift in {prop} ({mode}): QML has {actual}, canonical tokens.json has {expected} ({token_key})"
                )

    # 2. Verify radius tokens
    for prop, key in RADIUS_MAPPING.items():
        expected = metrics['radiusPx'].get(key)
        actual = qml_ints.get(prop)
        if actual is None:
            errors.append(f"Missing radius property {prop} in ThemeData.qml")
        elif actual != expected:
            errors.append(f"Radius mismatch in {prop}: QML has {actual}, canonical tokens.json has {expected}")

    # 3. Verify motion duration tokens
    for prop, key in MOTION_MAPPING.items():
        expected = metrics['motionMs'].get(key)
        actual = qml_ints.get(prop)
        if actual is None:
            errors.append(f"Missing motion property {prop} in ThemeData.qml")
        elif actual != expected:
            errors.append(f"Motion duration mismatch in {prop}: QML has {actual}, canonical tokens.json has {expected}")

    if errors:
        print(f"FAIL: {len(errors)} token parity errors found between ThemeData.qml and canonical tokens:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(
        f"PASS: ThemeData.qml matches canonical Warm Minimalist tokens ("
        f"{len(ROLE_MAPPING)} colors across dark/light, {len(RADIUS_MAPPING)} radii, {len(MOTION_MAPPING)} motion durations)"
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
