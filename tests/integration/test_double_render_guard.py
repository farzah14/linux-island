#!/usr/bin/env python3
"""The Qt overlay must refuse to draw a second island.

The GNOME extension and the Qt overlay are independent renderers. Running both
puts two capsules on screen. `linux-island-launch` disables the extension before
starting the overlay, but invoking the binary directly bypassed that and left a
duplicate. The binary now checks the Shell's extension state itself.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAIN = ROOT / 'island-ui/main.cpp'

src = MAIN.read_text()

# The guard must be present and must consult the Shell's extension registry.
assert 'ISLAND_ALLOW_DOUBLE_RENDER' in src, \
    'overlay needs an ISLAND_ALLOW_DOUBLE_RENDER escape hatch'
assert 'org.gnome.Shell.Extensions' in src, \
    'overlay must query the Shell extension registry'
assert 'GetExtensionInfo' in src, \
    'overlay must ask whether linux-island@local is enabled'
assert 'linux-island@local' in src, \
    'overlay must check the concrete extension uuid'
assert 'refusing to start a second one' in src, \
    'overlay must explain why it refused'

# The guard must not run during the headless smoke test, which has no Shell.
guard_at = src.index('ISLAND_ALLOW_DOUBLE_RENDER')
smoke_at = src.index('--smoke-test')
assert smoke_at < guard_at, 'smoke-test detection must precede the guard'

print('PASS: Qt overlay refuses a second island when the extension is active')
