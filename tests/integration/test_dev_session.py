#!/usr/bin/env python3
"""Stage B: dev session runner selection and stop-safety tests.

Pure logic tests only. These do not prove GNOME compatibility or that a
runtime session actually started; they prove the runner chooses the right
mode and never signals the primary shell.
"""
from pathlib import Path
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / 'scripts/dev/dev-session.sh'


def mode_for(version, has_devkit):
    """Ask the real runner to resolve a mode instead of reimplementing it."""
    env = dict(os.environ)
    env['ISLAND_FAKE_VERSION'] = version
    env['ISLAND_FAKE_DEVKIT'] = '1' if has_devkit else '0'
    out = subprocess.run(
        ['bash', str(RUNNER), 'mode'],
        capture_output=True, text=True, env=env, timeout=20,
    )
    return out.returncode, out.stdout.strip(), out.stderr.strip()


def test_version_selection():
    assert mode_for('46.0', False)[:2] == (0, 'nested'), 'GNOME 46 must use nested'
    assert mode_for('48.4', False)[:2] == (0, 'nested'), 'GNOME 48 must use nested'
    assert mode_for('49.0', True)[:2] == (0, 'devkit'), 'GNOME 49 with devkit binary uses devkit'
    assert mode_for('50.1', True)[:2] == (0, 'devkit'), 'GNOME 50 with devkit binary uses devkit'
    print('PASS: shell mode selection by version and devkit availability')


def test_devkit_missing_falls_back():
    code, mode, err = mode_for('50.1', False)
    assert code == 0 and mode == 'headless', f'expected headless fallback, got {mode!r}'
    assert 'devkit' in err.lower(), 'missing devkit must be diagnosed on stderr'
    print('PASS: missing devkit degrades to headless with a diagnosis')


def test_unknown_version_rejected():
    code, mode, err = mode_for('garbage', False)
    assert code != 0, 'unknown version must fail rather than guess'
    assert 'version' in err.lower()
    print('PASS: unknown GNOME version is rejected with a diagnosis')


def test_stop_is_scoped_to_runner():
    """The runner must never kill by broad name patterns."""
    text = RUNNER.read_text()
    assert 'pkill' not in text, 'runner must not use pkill (would hit the primary shell)'
    assert 'killall' not in text, 'runner must not use killall'
    # Any kill must target a pid/pgid recorded by this runner.
    for line in text.splitlines():
        if re.search(r'\bkill\b', line) and not line.lstrip().startswith('#'):
            assert ('PID' in line or 'PGID' in line or 'pid' in line or 'pgid' in line), \
                f'unscoped kill: {line.strip()}'
    print('PASS: stop only targets runner-owned pids')


def test_stop_cleans_state():
    """A stopped session must not leave a stale bus-address or staged tree."""
    text = RUNNER.read_text()
    assert 'cleanup_state' in text, 'stop must clean per-run state'
    stop_body = text.split('cmd_stop()')[1].split('cmd_status()')[0]
    assert 'cleanup_state' in stop_body, 'cleanup must be called from stop'
    assert 'rm -rf "$STATE_DIR"' in text
    print('PASS: stop removes per-run state')


def test_private_runtime_dir_required():
    text = RUNNER.read_text()
    assert 'chmod 700' in text, 'private runtime dir must be 0700'
    assert 'XDG_RUNTIME_DIR' in text, 'runner must isolate XDG_RUNTIME_DIR'
    assert 'DCONF_PROFILE' in text, 'runner must isolate dconf to protect the primary desktop'
    print('PASS: runner isolates runtime dir and dconf profile')


if __name__ == '__main__':
    test_version_selection()
    test_devkit_missing_falls_back()
    test_unknown_version_rejected()
    test_stop_is_scoped_to_runner()
    test_stop_cleans_state()
    test_private_runtime_dir_required()
    print('PASS: dev session runner contract')
