#!/usr/bin/env python3
"""Per-user install/uninstall round trip.

Runs install-local.sh and uninstall-local.sh against a throwaway HOME so the
manifest, the rewritten desktop entries and the preserved configuration are
verified end to end.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD_CACHE = ROOT / 'build/dev/CMakeCache.txt'


def run(script, env, *args):
    return subprocess.run(['bash', str(ROOT / script), *args],
                          capture_output=True, text=True, env=env, timeout=600)


def main():
    if not BUILD_CACHE.exists():
        print('SKIP: build/dev/CMakeCache.txt absent; configure the dev preset first')
        return 0

    with tempfile.TemporaryDirectory(prefix='island-local-install-') as tmp_name:
        tmp = Path(tmp_name)
        home = tmp / 'home'
        config = home / '.config'
        data = home / '.local/share'
        runtime = tmp / 'runtime'
        for path in (config, data, runtime):
            path.mkdir(parents=True)

        env = {
            'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
            'HOME': str(home),
            'XDG_CONFIG_HOME': str(config),
            'XDG_DATA_HOME': str(data),
            'XDG_RUNTIME_DIR': str(runtime),
        }

        result = run('packaging/dev/install-local.sh', env, '--no-systemd', '--no-autostart')
        assert result.returncode == 0, f'install failed:\n{result.stdout}\n{result.stderr}'
        assert 'Verified:' in result.stdout, result.stdout

        manifest = data / 'linux-island/installed-files.txt'
        assert manifest.exists(), 'manifest missing'
        entries = [line for line in manifest.read_text().splitlines() if line]
        assert entries, 'manifest is empty'
        joined = '\n'.join(entries)
        for needle in ('bin/linux-island-launch', 'libexec/linux-island-ui',
                       'share/applications/linux-island.desktop'):
            assert needle in joined, f'manifest lacks {needle}'
        for entry in entries:
            assert Path(entry).exists(), f'manifest lists a missing file: {entry}'

        assert (home / '.local/bin/linux-island-launch').exists()
        assert not (config / 'systemd/user/linux-island-core.service').exists(), \
            '--no-systemd must not install the unit'
        assert not (config / 'autostart/linux-island.desktop').exists(), \
            '--no-autostart must not install the autostart entry'

        # A settings file must survive the uninstall.
        settings = config / 'linux-island/settings.json'
        settings.parent.mkdir(parents=True, exist_ok=True)
        settings.write_text('{"displayMode":"dynamic"}')

        result = run('packaging/dev/uninstall-local.sh', env, '--no-systemd')
        assert result.returncode == 0, f'uninstall failed:\n{result.stdout}\n{result.stderr}'
        for entry in entries:
            assert not Path(entry).exists(), f'uninstall left {entry}'
        assert settings.exists(), 'uninstall must preserve the configuration'
        print('PASS: per-user install and uninstall')

    return 0


if __name__ == '__main__':
    sys.exit(main())
