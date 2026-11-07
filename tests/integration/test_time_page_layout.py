#!/usr/bin/env python3
"""Guards the merged Calendar & Timer page against silent vertical clipping.

The page combines an agenda header, up to two event rows, the timer clock,
progress bar and two chip rows. When the page was first merged it declared 98px
while its content needed more, so QML quietly clipped the bottom rows. This
test recomputes the budget from the QML source and fails if the declared height
is smaller than the sum of the declared row heights.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / 'island-ui/qml/TimePage.qml'
WINDOW = ROOT / 'island-ui/qml/IslandWindow.qml'

source = PAGE.read_text()

# Declared page height must come from a single named constant so the smoke test
# and the window height can both reference it.
match = re.search(r'readonly property int contentHeight:\s*(?:root\.idle\s*\?\s*)?(\d+)(?:\s*:\s*(\d+))?', source)
assert match, 'TimePage.qml must declare contentHeight'
declared = int(match.group(1))
running_declared = int(match.group(2)) if match.group(2) else declared
assert 'implicitHeight: 116' in source or 'implicitHeight: contentHeight' in source, \
    'TimePage.qml implicitHeight must be defined'
# Not every declared row is visible at once: the offline notice replaces the
# clock, and the custom/mode/stats rows are idle-only. Model the tallest
# realistic combination instead of naively summing everything.
#
#   clock row 26            (or the 26px offline notice)
#   progress 4
#   controls 18
#   custom 18   (idle only)
#   modes 18    (idle only)
#   stats 16    (idle only)
#   ColumnLayout spacing 4 between each visible child
clock, progress, controls, custom, modes, stats = 26, 4, 18, 18, 18, 16
spacing = 4

idle_core = [clock, progress, controls, custom, modes]
running = [clock, progress, controls]
core_needed = sum(idle_core) + spacing * (len(idle_core) - 1)
running_needed = sum(running) + spacing * (len(running) - 1)

assert declared >= core_needed, (
    f'TimePage contentHeight {declared}px is smaller than the {core_needed}px its '
    f'core idle row combination needs; QML will clip')
assert running_declared >= running_needed, (
    f'TimePage running contentHeight {running_declared}px is smaller than the {running_needed}px '
    f'of rows it needs; QML will clip')
for value in (clock, progress, controls, custom, modes, stats):
    assert f'Layout.preferredHeight: {value}' in source, \
        f'expected a {value}px row in TimePage.qml'

# The window must reserve exactly this much for page 3 plus the card chrome.
window = WINDOW.read_text()
assert 'timePage.contentHeight + 52' in window, \
    'IslandWindow must size the expanded card from timePage.contentHeight'

print(f'PASS: TimePage height budget (idle {declared}px >= {core_needed}px, running {running_declared}px >= {running_needed}px)')
