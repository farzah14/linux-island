#!/usr/bin/env python3
"""Stage D: unified dev CLI contract.

Verifies argument handling and target safety without touching a live session.
Runtime behaviour is covered separately by manual evidence in
docs/development-without-logout.md.
"""
from pathlib import Path
import os
import subprocess

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / 'scripts/dev/dev.sh'


def run(*args, env=None):
    e = dict(os.environ)
    e.setdefault('XDG_RUNTIME_DIR', '/tmp/island-cli-test-runtime')
    if env:
        e.update(env)
    return subprocess.run(['bash', str(CLI), *args],
                          capture_output=True, text=True, env=e, timeout=30)


def test_help_lists_commands():
    r = run('--help')
    assert r.returncode == 0
    for cmd in ('doctor', 'preview', 'reload', 'status', 'rollback', 'stop'):
        assert cmd in r.stdout, f'missing {cmd} in help'
    print('PASS: help documents every command')


def test_unknown_command_is_usage_error():
    r = run('nonsense')
    assert r.returncode == 2, f'expected 2, got {r.returncode}'
    print('PASS: unknown command exits 2')


def test_reload_without_target_is_refused():
    """No target and no running dev session must not guess."""
    empty = '/tmp/island-cli-test-no-session'
    os.makedirs(empty, exist_ok=True)
    r = run('reload', 'extension', env={'ISLAND_STATE_DIR': empty})
    assert r.returncode == 2, f'expected 2, got {r.returncode}: {r.stderr}'
    assert 'no target' in r.stderr.lower() or 'no target given' in r.stderr.lower()
    print('PASS: ambiguous target is refused before any mutation')


def test_bad_target_rejected():
    r = run('reload', 'extension', '--target', 'nonsense')
    assert r.returncode == 2
    assert 'unknown target' in r.stderr.lower()
    print('PASS: invalid target is rejected')


def test_unknown_reload_subcommand():
    r = run('reload', 'wat', '--target', 'dev-session')
    assert r.returncode == 2
    print('PASS: unknown reload subcommand is rejected')


def test_doctor_is_read_only():
    """doctor must not create a session or mutate extension state."""
    state = '/tmp/island-cli-test-doctor'
    os.makedirs(state, exist_ok=True)
    r = run('doctor', env={'ISLAND_STATE_DIR': state})
    # doctor may report problems, but must not fail with a usage error
    assert r.returncode in (0, 1), f'unexpected {r.returncode}'
    assert 'Result:' in r.stdout
    print('PASS: doctor reports a result without mutating state')


def test_core_readiness_requires_new_instance():
    """`reload core` must prove a *new* instance, not just a live bus name."""
    text = CLI.read_text()
    assert 'core_instance_id' in text, 'must read instanceId from GetSnapshot'
    assert 'wait_for_new_core' in text, 'must wait for a changed instanceId'
    # A bus-name-only check would be the bug this guards against.
    assert 'new instanceId' in text, 'success message must mention the new instanceId'
    # The old implementation only polled NameHasOwner; ensure it is not the gate.
    gate = text.split('reload_core()')[1].split('# --- status')[0]
    assert 'NameHasOwner' not in gate, \
        'reload_core must not treat a live bus name as readiness'
    print('PASS: core reload gates on a changed instanceId')


def test_core_readiness_fails_loudly():
    text = CLI.read_text()
    gate = text.split('wait_for_new_core()')[1].split('reload_core()')[0]
    assert 'return 1' in gate, 'wait_for_new_core must fail after the timeout'
    assert 'die' in text.split('reload_core()')[1], 'reload_core must die on timeout'
    print('PASS: core readiness timeout is a hard failure')


if __name__ == '__main__':
    test_help_lists_commands()
    test_unknown_command_is_usage_error()
    test_reload_without_target_is_refused()
    test_bad_target_rejected()
    test_unknown_reload_subcommand()
    test_doctor_is_read_only()
    test_core_readiness_requires_new_instance()
    test_core_readiness_fails_loudly()
    print('PASS: dev CLI contract')
