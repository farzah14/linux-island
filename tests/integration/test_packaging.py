#!/usr/bin/env python3
"""Installed-layout and package checks.

Asserts the CMake install rules produce every runtime file a package needs,
that the systemd unit is templated with the real install prefix, and that
CPack can produce TGZ and DEB artifacts.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / 'packaging/bin/linux-island-launch'


def run(cmd, **kwargs):
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def fail(message):
    print(f'FAIL: {message}', file=sys.stderr)
    raise SystemExit(1)


def skip(message):
    print(f'SKIP: {message}')


def require(condition, message):
    if not condition:
        fail(message)


def check_layout(prefix: Path):
    expected = [
        'bin/linux-island-launch',
        'bin/linux-island-settings',
        'libexec/linux-island-core',
        'libexec/linux-island-ui',
        'share/gnome-shell/extensions/linux-island@local/metadata.json',
        'share/applications/linux-island.desktop',
        'share/applications/linux-island-settings.desktop',
        'share/metainfo/io.github.linuxisland.metainfo.xml',
        'share/icons/hicolor/scalable/apps/io.github.linuxisland.svg',
        'share/dbus-1/interfaces/io.github.linuxisland.Core1.xml',
        'share/licenses/linux-island/LICENSE',
        'share/linux-island/window-rules/kwin-linux-island.kwinrule',
        'share/linux-island/window-rules/hyprland.conf',
        'share/linux-island/window-rules/sway.conf',
    ]
    for rel in expected:
        require((prefix / rel).exists(), f'missing installed file: {rel}')

    for rel in ('bin/linux-island-launch', 'bin/linux-island-settings',
                'libexec/linux-island-core', 'libexec/linux-island-ui'):
        require((prefix / rel).stat().st_mode & 0o111, f'not executable: {rel}')

    metadata = json.loads(
        (prefix / 'share/gnome-shell/extensions/linux-island@local/metadata.json').read_text())
    require(metadata['shell-version'] == ['45', '46', '47', '48', '49', '50'],
            f'unexpected shell-version: {metadata["shell-version"]}')

    unit = prefix / 'lib/systemd/user/linux-island-core.service'
    require(unit.exists(), 'missing lib/systemd/user/linux-island-core.service')
    exec_start = [line for line in unit.read_text().splitlines()
                  if line.startswith('ExecStart=')]
    require(len(exec_start) == 1, 'unit must have exactly one ExecStart')
    require(exec_start[0] == f'ExecStart={prefix}/libexec/linux-island-core',
            f'unit ExecStart does not follow the prefix: {exec_start[0]}')
    require(not (prefix / 'lib/systemd/user/linux-island-ui.service').exists(),
            'linux-island-ui.service must not be installed')

    # The staged copy is what install-local.sh moves into ~/.config/systemd/user.
    staged = prefix / 'share/linux-island/linux-island-core.service'
    require(staged.exists(), 'missing staged systemd unit in share/linux-island')
    require(staged.read_text() == unit.read_text(),
            'staged unit differs from the installed unit')

    launch_text = LAUNCHER.read_text()
    require('ISLAND_VERSION="0.1.0"' in launch_text, 'launcher version is not 0.1.0')
    require('project(LinuxIsland VERSION 0.1.0' in (ROOT / 'CMakeLists.txt').read_text(),
            'CMake project version is not 0.1.0')


def check_desktop_files():
    if not shutil.which('desktop-file-validate'):
        skip('desktop-file-validate not installed')
        return
    files = list((ROOT / 'packaging/desktop').glob('*.desktop'))
    files += list((ROOT / 'packaging/autostart').glob('*.desktop'))
    result = run(['desktop-file-validate', *map(str, files)])
    require(result.returncode == 0, f'desktop-file-validate failed:\n{result.stdout}{result.stderr}')


def check_appstream():
    if not shutil.which('appstreamcli'):
        skip('appstreamcli not installed')
        return
    result = run(['appstreamcli', 'validate', '--no-net',
                  str(ROOT / 'packaging/metainfo/io.github.linuxisland.metainfo.xml')])
    require(result.returncode == 0, f'appstreamcli failed:\n{result.stdout}{result.stderr}')


def check_packages(build_dir: Path, tmp: Path):
    tgz_dir = tmp / 'tgz'
    result = run(['cpack', '-G', 'TGZ', '-B', str(tgz_dir)], cwd=build_dir)
    require(result.returncode == 0, f'cpack TGZ failed:\n{result.stdout}{result.stderr}')
    archives = list(tgz_dir.glob('*.tar.gz'))
    require(len(archives) == 1, f'expected one TGZ, found {[a.name for a in archives]}')

    if not shutil.which('dpkg-deb'):
        skip('dpkg-deb not installed')
        return
    deb_dir = tmp / 'deb'
    result = run(['cpack', '-G', 'DEB', '-B', str(deb_dir)], cwd=build_dir)
    require(result.returncode == 0, f'cpack DEB failed:\n{result.stdout}{result.stderr}')
    debs = list(deb_dir.glob('*.deb'))
    require(len(debs) == 1, f'expected one DEB, found {[d.name for d in debs]}')
    fields = run(['dpkg-deb', '-f', str(debs[0])])
    require(fields.returncode == 0, 'dpkg-deb -f failed')
    require('qml6-module-qtwebengine' in fields.stdout,
            f'Depends lacks qml6-module-qtwebengine:\n{fields.stdout}')

    if not shutil.which('rpmbuild'):
        skip('rpmbuild not installed')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--build-dir', required=True)
    args = parser.parse_args()

    build_dir = Path(args.build_dir).resolve()
    require((build_dir / 'CMakeCache.txt').exists(), f'no CMake build tree at {build_dir}')

    with tempfile.TemporaryDirectory(prefix='island-packaging-') as tmp_name:
        tmp = Path(tmp_name)
        prefix = tmp / 'prefix'
        result = run(['cmake', '--install', str(build_dir), '--prefix', str(prefix)])
        require(result.returncode == 0, f'cmake --install failed:\n{result.stdout}{result.stderr}')
        check_layout(prefix)
        check_desktop_files()
        check_appstream()
        check_packages(build_dir, tmp)

    print('PASS: packaging install layout and packages')


if __name__ == '__main__':
    main()
