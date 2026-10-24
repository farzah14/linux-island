"""Static M0 checks only; these do not validate a live GNOME session."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
metadata = json.loads((root / 'extension/metadata.json').read_text())
assert metadata['uuid'] == 'linux-island@local'
assert '46' in metadata['shell-version']

required_files = [
    'CMakeLists.txt', 'CMakePresets.json', 'core/CMakeLists.txt',
    'core/app/main.cpp', 'extension/extension.js', 'extension/ui/capsule.js',
    'tests/extension/manual-smoke.md', 'docs/compatibility.md',
]
for path in required_files:
    assert (root / path).is_file(), f'Missing {path}'

print('PASS: M0 static scaffold checks')
