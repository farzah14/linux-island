#!/usr/bin/env python3
"""Compare installed Linux Island files with this checkout and build."""
import argparse
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').digest()


def verify(source_root, build_root, prefix):
    extension = source_root / 'extension'
    binaries = {
        build_root / 'core/linux-island-core': prefix / 'libexec/linux-island-core',
        build_root / 'island-ui/linux-island-ui': prefix / 'libexec/linux-island-ui',
        build_root / 'settings-app/linux-island-settings': prefix / 'bin/linux-island-settings',
    }
    if not extension.is_dir() or any(not path.is_file() for path in binaries):
        print('ERROR: checkout extension or build binaries are unavailable')
        return 2
    installed_extension = prefix / 'share/gnome-shell/extensions/linux-island@local'
    pairs = [(path, installed_extension / path.relative_to(extension))
             for path in extension.rglob('*')
             if path.is_file() and path.name != 'gschemas.compiled']
    pairs.extend(binaries.items())
    differences = 0
    for source, installed in pairs:
        if not installed.is_file():
            print(f'MISSING: {installed}')
            differences += 1
        elif digest(source) != digest(installed):
            print(f'DIFFERENT: {installed}')
            differences += 1
    if differences:
        print(f'FAIL: {differences} installed files differ or are missing')
        return 1
    print(f'PASS: {len(pairs)} installed files match')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', type=Path, default=Path.home() / '.local')
    args = parser.parse_args()
    return verify(ROOT, ROOT / 'build/dev', args.prefix.expanduser())


if __name__ == '__main__':
    raise SystemExit(main())
