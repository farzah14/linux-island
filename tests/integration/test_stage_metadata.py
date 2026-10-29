#!/usr/bin/env python3
"""Stage-metadata: declare the host GNOME major version in a staged copy only.

Guards against the most common multi-version failure: GNOME marks an extension
OUT_OF_DATE when `shell-version` lacks the running major, so a dev session on
GNOME 48/49/51 silently loads nothing.
"""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/dev/stage-metadata.py'


def run(metadata: dict, version: str):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'metadata.json'
        p.write_text(json.dumps(metadata))
        r = subprocess.run(
            [sys.executable, str(SCRIPT), '--metadata', str(p), '--shell-version', version],
            capture_output=True, text=True, timeout=20,
        )
        result = json.loads(p.read_text()) if p.exists() else None
        return r, result


def test_adds_missing_major():
    r, md = run({'uuid': 'x@y', 'shell-version': ['46', '50']}, '48.4')
    assert r.returncode == 0, r.stderr
    assert '48' in md['shell-version'], md
    assert md['shell-version'][:2] == ['46', '50'], 'existing entries must be preserved'
    print('PASS: missing major is appended, existing entries preserved')


def test_noop_when_present():
    r, md = run({'uuid': 'x@y', 'shell-version': ['46', '50']}, '50.1')
    assert r.returncode == 0
    assert md['shell-version'] == ['46', '50'], 'must not duplicate'
    print('PASS: already-declared major is a no-op')


def test_handles_missing_list():
    r, md = run({'uuid': 'x@y'}, '51.2')
    assert r.returncode == 0
    assert md['shell-version'] == ['51']
    print('PASS: missing shell-version list is created')


def test_rejects_garbage_version():
    r, md = run({'uuid': 'x@y', 'shell-version': ['46']}, 'garbage')
    assert r.returncode == 2, 'unparseable version must fail'
    print('PASS: unparseable shell version is rejected')


def test_warns_about_unverified_version():
    r, _ = run({'uuid': 'x@y', 'shell-version': ['46', '50']}, '49.0')
    assert 'unverified' in r.stderr.lower(), r.stderr
    print('PASS: unverified major produces an explicit warning')


def test_repo_metadata_not_modified():
    """The audited repository metadata must stay untouched."""
    md = json.loads((ROOT / 'extension/metadata.json').read_text())
    assert md['shell-version'] == ['46', '50'], \
        f'repository metadata must keep the audited list, got {md["shell-version"]}'
    print('PASS: repository metadata keeps the audited support list')


if __name__ == '__main__':
    test_adds_missing_major()
    test_noop_when_present()
    test_handles_missing_list()
    test_rejects_garbage_version()
    test_warns_about_unverified_version()
    test_repo_metadata_not_modified()
    print('PASS: stage-metadata contract')
