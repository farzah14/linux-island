#!/usr/bin/env python3
import importlib.util
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('verify_installed', ROOT / 'scripts/dev/verify-installed.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    source, build, prefix = root / 'source', root / 'build', root / 'prefix'
    extension = source / 'extension/ui/capsule.js'
    extension.parent.mkdir(parents=True)
    extension.write_text('current')
    pairs = [('core/linux-island-core', 'libexec/linux-island-core'),
             ('island-ui/linux-island-ui', 'libexec/linux-island-ui'),
             ('settings-app/linux-island-settings', 'bin/linux-island-settings')]
    for src, dst in pairs:
        for path in (build / src, prefix / dst):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(src)
    installed = prefix / 'share/gnome-shell/extensions/linux-island@local/ui/capsule.js'
    installed.parent.mkdir(parents=True)
    installed.write_text('current')
    assert module.verify(source, build, prefix) == 0
    installed.write_text('stale')
    assert module.verify(source, build, prefix) == 1
    installed.unlink()
    assert module.verify(source, build, prefix) == 1
    (build / pairs[0][0]).unlink()
    assert module.verify(source, build, prefix) == 2
print('PASS: installed file verification')
