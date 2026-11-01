#!/usr/bin/env python3
"""Launcher routing checks against stub binaries.

Verifies session detection (GNOME extension vs Qt overlay), the XWayland
platform decision and the argument-only commands, without touching the real
session.
"""
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER_SRC = ROOT / 'packaging/bin/linux-island-launch'


def write_stub(path: Path, body: str):
    path.write_text(f'#!/bin/sh\n{body}\n')
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def parse_config(text: str) -> dict:
    values = {}
    for line in text.splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            values[key] = value
    return values


def main():
    with tempfile.TemporaryDirectory(prefix='island-launcher-') as tmp_name:
        tmp = Path(tmp_name)
        prefix = tmp / 'prefix'
        (prefix / 'bin').mkdir(parents=True)
        (prefix / 'libexec').mkdir(parents=True)
        (tmp / 'home/.config').mkdir(parents=True)
        (tmp / 'runtime').mkdir()

        launcher = prefix / 'bin/linux-island-launch'
        shutil.copy2(LAUNCHER_SRC, launcher)
        launcher.chmod(0o755)

        write_stub(prefix / 'libexec/linux-island-core', 'echo "core 0.1.0"')
        write_stub(prefix / 'libexec/linux-island-ui', 'echo "ui $@"')
        write_stub(prefix / 'bin/linux-island-settings', 'echo "settings 0.1.0"')

        env = {
            'PATH': '/usr/bin:/bin',
            'HOME': str(tmp / 'home'),
            'XDG_CONFIG_HOME': str(tmp / 'home/.config'),
            'XDG_DATA_HOME': str(tmp / 'home/.local/share'),
            'XDG_RUNTIME_DIR': str(tmp / 'runtime'),
            'XDG_SESSION_TYPE': 'x11',
        }

        def run(args, **overrides):
            merged = dict(env)
            merged.update(overrides)
            return subprocess.run([str(launcher), *args], capture_output=True, text=True,
                                  env=merged, timeout=30)

        # --version
        result = run(['--version'])
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == 'linux-island-launch 0.1.0', result.stdout
        print('PASS: launcher version')

        gnome_wayland = {
            'XDG_CURRENT_DESKTOP': 'GNOME',
            'XDG_SESSION_TYPE': 'wayland',
            'DISPLAY': ':0',
        }

        result = run(['--print-config'], **gnome_wayland)
        assert result.returncode == 0, result.stderr
        config = parse_config(result.stdout)
        assert config['mode'] == 'extension', config
        assert config['platform'] == 'xcb', config
        assert config['de'] == 'GNOME', config
        assert config['session'] == 'wayland', config
        assert config['display_mode'] == 'dynamic', config

        result = run(['--standalone', '--print-config'], **gnome_wayland)
        config = parse_config(result.stdout)
        assert config['mode'] == 'overlay', config
        assert config['platform'] == 'xcb', config

        kde_wayland = {
            'XDG_CURRENT_DESKTOP': 'KDE',
            'XDG_SESSION_TYPE': 'wayland',
            'DISPLAY': ':0',
        }
        result = run(['--print-config'], **kde_wayland)
        config = parse_config(result.stdout)
        assert config['mode'] == 'overlay', config
        assert config['platform'] == 'xcb', config

        result = run(['--print-config'], ISLAND_NATIVE_WAYLAND='1', **kde_wayland)
        config = parse_config(result.stdout)
        assert config['platform'] == 'wayland', config

        # Wayland with no DISPLAY means no XWayland server.
        no_display = dict(kde_wayland)
        no_display.pop('DISPLAY')
        result = run(['--print-config'], **no_display)
        config = parse_config(result.stdout)
        assert config['platform'] == 'wayland', config

        result = run(['--print-config'], XDG_SESSION_TYPE='x11', XDG_CURRENT_DESKTOP='XFCE')
        config = parse_config(result.stdout)
        assert config['platform'] == 'default', config
        assert config['mode'] == 'overlay', config
        print('PASS: launcher routing')

        # Missing UI must fail loudly, not silently do nothing.
        (prefix / 'libexec/linux-island-ui').unlink()
        result = run(['--standalone'], **kde_wayland)
        assert result.returncode == 1, (result.returncode, result.stdout, result.stderr)
        assert 'linux-island-ui binary not found' in result.stderr, result.stderr
        print('PASS: launcher reports a missing UI binary')


if __name__ == '__main__':
    main()
